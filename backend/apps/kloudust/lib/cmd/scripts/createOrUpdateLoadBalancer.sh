#!/bin/bash

# Params
# {1} Load Balancer Name
# {2} Scheduler
# {3} Frontend IP
# {4} Frontend Port
# {5} Protocol (tcp or udp)
# {6} Backend servers json
# {7} Vnet gateways json

LB_NAME="{1}"
SCHEDULER="{2}"
FRONTEND_IP="{3}"
FRONTEND_PORT="{4}"
PROTOCOL="{5}"
BACKENDS={6}
VNET_GATEWAYS={7}

SCRIPT_PATH=$(readlink -f "$0")
LB_BOOT_SCRIPT="/kloudust/system/hostinit/30loadbalancer_${LB_NAME}.sh"

function exitFailed() {
    echo "Failed"
    exit 1
}

echo "Configuring load balancer namespace: ${LB_NAME}"

if ! ip netns list | awk '{print $1}' | grep -Fxq "${LB_NAME}"; then
    if ! ip netns add "${LB_NAME}"; then exitFailed; fi
fi

if ! ip netns exec "${LB_NAME}" ip link set lo up; then exitFailed; fi

#setup the nat rule for the load balancer namespace
if ! ip netns exec "${LB_NAME}" nft list table ip ipvs_nat >/dev/null 2>&1; then
    if ! ip netns exec "${LB_NAME}" nft add table ip ipvs_nat; then exitFailed; fi
fi

if ! ip netns exec "${LB_NAME}" nft list chain ip ipvs_nat postrouting >/dev/null 2>&1; then
    if ! ip netns exec "${LB_NAME}" nft add chain ip ipvs_nat postrouting "{ type nat hook postrouting priority srcnat ; }"; then exitFailed; fi
fi

if ! ip netns exec "${LB_NAME}" sysctl -w net.ipv4.vs.conntrack=1; then exitFailed; fi

# Connect to VNets
while read -r entry; do
    if [[ -z "${entry}" ]]; then continue; fi
    VNET_NAME=$(jq -r '.vnet' <<< "${entry}")
    GATEWAY_IP=$(jq -r '.gateway_address' <<< "${entry}")
    VNET_NUM=$(jq -r '.vnetnum' <<< "${entry}")
    VNET_NAME_HASH=$(jq -r '.vnet_name_hash' <<< "${entry}")
    OP=$(jq -r '.op' <<< "${entry}")
    DEFAULT_GATEWAY=$(jq -r '.defaultGateway' <<< "${entry}")


    if [[ -z "${VNET_NAME}" || "${VNET_NAME}" == "null" ]]; then
        echo "Invalid vnet field"
        exitFailed
    fi

    if [[ -z "${GATEWAY_IP}" || "${GATEWAY_IP}" == "null" ]]; then
        echo "Invalid gateway_ip/ip field"
        exitFailed
    fi

    if [[ -z "${VNET_NUM}" || "${VNET_NUM}" == "null" ]]; then
        echo "Invalid vnetnum field"
        exitFailed
    fi

    if [[ -z "${VNET_NAME_HASH}" || "${VNET_NAME_HASH}" == "null" ]]; then
        echo "Invalid vnet_name_hash field"
        exitFailed
    fi

    if [[ -z "${OP}" || "${OP}" == "null" ]]; then
        echo "Invalid op field"
        exitFailed
    fi

    if [[ -z "${DEFAULT_GATEWAY}" || "${DEFAULT_GATEWAY}" == "null" ]]; then
        echo "Invalid defaultGateway field"
        exitFailed
    fi

    if [[ "${OP}" == "del" ]]; then
        BRIDGE_NAME="kd${VNET_NUM}_br"
        VETH_BR="${VNET_NAME_HASH}_br"
        VETH_NS="${VNET_NAME_HASH}_ns"

        echo "Removing ${VNET_NAME}"
        if ip netns exec "${LB_NAME}" ip link show "${VETH_NS}" >/dev/null 2>&1; then
            ip netns exec "${LB_NAME}" ip link del "${VETH_NS}" || exitFailed
        fi

        if ip link show "${VETH_BR}" >/dev/null 2>&1; then
            ip link del "${VETH_BR}" || exitFailed
        fi

        continue
    fi

    BRIDGE_NAME="kd${VNET_NUM}_br"
    VETH_BR="${VNET_NAME_HASH}_br"
    VETH_NS="${VNET_NAME_HASH}_ns"

    echo "Configuring ${VNET_NAME}"
    echo "  Bridge: ${BRIDGE_NAME}"
    echo "  IP: ${GATEWAY_IP}"

    if ! ip link show "${BRIDGE_NAME}" >/dev/null 2>&1; then
        echo "Bridge does not exist: ${BRIDGE_NAME}"
        exitFailed
    fi

    if ip link show "${VETH_BR}" >/dev/null 2>&1; then
        ip link del "${VETH_BR}" || exitFailed
    fi

    if ! ip link add "${VETH_BR}" type veth peer name "${VETH_NS}"; then exitFailed; fi
    if ! ip link set "${VETH_NS}" netns "${LB_NAME}"; then exitFailed; fi
    if ! ip link set "${VETH_BR}" master "${BRIDGE_NAME}"; then exitFailed; fi
    if ! ip link set "${VETH_BR}" up; then exitFailed; fi
    if ! ip netns exec "${LB_NAME}" ip addr replace "${GATEWAY_IP}/24" dev "${VETH_NS}"; then exitFailed; fi
    if ! ip netns exec "${LB_NAME}" ip link set "${VETH_NS}" up; then exitFailed; fi
    if [ $DEFAULT_GATEWAY == "true" ]; then
        if ! ip netns exec "${LB_NAME}" ip route replace default via "${GATEWAY_IP}" dev "${VETH_NS}"; then exitFailed; fi
    fi
    if ! ip netns exec "${LB_NAME}" nft add rule ip ipvs_nat postrouting oifname "\"${VETH_NS}\"" masquerade; then exitFailed; fi

done < <(jq -c '.[]' <<< "${VNET_GATEWAYS}")

# Configure ipvsadm rules
echo "Configuring ipvsadm rules for ${FRONTEND_IP}:${FRONTEND_PORT} (${PROTOCOL}) using scheduler ${SCHEDULER}"
# Clear existing rules first
ip netns exec "${LB_NAME}" ipvsadm -C
# Create virtual service
PROTO_FLAG="-t"
if [[ "${PROTOCOL}" == "udp" ]]; then
    PROTO_FLAG="-u"
fi

if ! ip netns exec "${LB_NAME}" ipvsadm -A "${PROTO_FLAG}" "${FRONTEND_IP}:${FRONTEND_PORT}" -s "${SCHEDULER}"; then exitFailed; fi

# Add backend servers
while read -r backend; do
    if [[ -z "${backend}" ]]; then continue; fi
    B_IP=$(jq -r '.ip' <<< "${backend}")
    B_PORT=$(jq -r '.port' <<< "${backend}")
    B_WEIGHT=$(jq -r '.weight' <<< "${backend}")

    if [[ -z "${B_IP}" || "${B_IP}" == "null" ]]; then
        continue
    fi
    if [[ -z "${B_PORT}" || "${B_PORT}" == "null" ]]; then
        B_PORT="${FRONTEND_PORT}"
    fi
    if [[ -z "${B_WEIGHT}" || "${B_WEIGHT}" == "null" ]]; then
        B_WEIGHT="1"
    fi

    echo "Adding backend server: ${B_IP}:${B_PORT} with weight ${B_WEIGHT}"
    if ! ip netns exec "${LB_NAME}" ipvsadm -a "${PROTO_FLAG}" "${FRONTEND_IP}:${FRONTEND_PORT}" -r "${B_IP}:${B_PORT}" -m -w "${B_WEIGHT}"; then exitFailed; fi
done < <(jq -c '.[]' <<< "${BACKENDS}")

if [ "$0" != "$LB_BOOT_SCRIPT" ]; then
    mkdir -p "$(dirname "$LB_BOOT_SCRIPT")"
    cp $SCRIPT_PATH $LB_BOOT_SCRIPT                                   
    chmod +x $LB_BOOT_SCRIPT
fi;

echo "Load balancer '${LB_NAME}' configured successfully"
