#!/bin/bash

# Params
# {1} The router name
# {2} The JSON string containing the VNet and gateway IP information. It should be an array of objects with the following structure: [{"vnet": "vnet_name", "gateway_ip": "gateway_ip", vnetnum: 1}, ...]

ROUTER_NAME="{1}"
VNET_GATEWAYS={2}

function exitFailed() {
    echo "Failed"
    exit 1
}

echo "Configuring router namespace: ${ROUTER_NAME}"

if ! ip netns list | awk '{print $1}' | grep -Fxq "${ROUTER_NAME}"; then
    if ! ip netns add "${ROUTER_NAME}"; then exitFailed; fi
fi

if ! ip netns exec "${ROUTER_NAME}" ip link set lo up; then exitFailed; fi

if ! ip netns exec "${ROUTER_NAME}" sysctl -q -w net.ipv4.ip_forward=1 >/dev/null; then exitFailed; fi

while read -r entry; do

    VNET_NAME=$(jq -r '.vnet' <<< "${entry}")
    GATEWAY_IP=$(jq -r '.gateway_address' <<< "${entry}")
    VNET_NUM=$(jq -r '.vnetnum' <<< "${entry}")

    if [[ -z "${VNET_NAME}" || "${VNET_NAME}" == "null" ]]; then
        echo "Invalid vnet field"
        exitFailed
    fi

    if [[ -z "${GATEWAY_IP}" || "${GATEWAY_IP}" == "null" ]]; then
        echo "Invalid gateway_ip field"
        exitFailed
    fi

    if [[ -z "${VNET_NUM}" || "${VNET_NUM}" == "null" ]]; then
        echo "Invalid vnetnum field"
        exitFailed
    fi

    BRIDGE_NAME="kd${VNET_NUM}_br"

    VNET_NAME_HASH=$(echo -n "$VNET_NAME" | sha256sum | cut -c1-12)
    VETH_BR="${VNET_NAME_HASH}_br"
    VETH_NS="${VNET_NAME_HASH}_ns"

    echo "Configuring ${VNET_NAME}"
    echo "  Bridge: ${BRIDGE_NAME}"
    echo "  Gateway: ${GATEWAY_IP}"

    if ! ip link show "${BRIDGE_NAME}" >/dev/null 2>&1; then
        echo "Bridge does not exist: ${BRIDGE_NAME}"
        exitFailed
    fi

    if ! ip link del "${VETH_BR}" >/dev/null 2>&1; then exitFailed; fi

    if ! ip netns exec "${ROUTER_NAME}" ip link del "${VETH_NS}" >/dev/null 2>&1; then exitFailed; fi

    if ! ip link add "${VETH_BR}" type veth peer name "${VETH_NS}"; then exitFailed; fi

    if ! ip link set "${VETH_NS}" netns "${ROUTER_NAME}"; then exitFailed; fi

    if ! ip link set "${VETH_BR}" master "${BRIDGE_NAME}"; then exitFailed; fi

    if ! ip link set "${VETH_BR}" up; then exitFailed; fi

    if ! ip netns exec "${ROUTER_NAME}" ip addr replace "${GATEWAY_IP}/24" dev "${VETH_NS}"; then exitFailed; fi

    if ! ip netns exec "${ROUTER_NAME}" ip link set "${VETH_NS}" up; then exitFailed; fi

done < <(jq -c '.[]' <<< "${VNET_GATEWAYS}")

echo "Router '${ROUTER_NAME}' configured successfully"