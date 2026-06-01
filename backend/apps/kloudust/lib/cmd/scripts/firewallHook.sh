#!/bin/bash

#########################################################################################################
# Installs and runs the libvirt qemu firewall hook.
#
# Usage:
#   install
#     Copies this script to /kloudust/system/libvirt-hooks/qemu and symlinks it to /etc/libvirt/hooks/qemu.
#   <libvirt hook args>
#     Called by libvirt on VM events. Reapplies firewall state for started/reconnect events.
#
# (C) 2026 TekMonks. All rights reserved.
#########################################################################################################

if [ -z "${FW_HOOK_BOOTSTRAPPED:-}" ] && [ $# -eq 0 ] && [ -p /dev/stdin ]; then
    FW_HOOK_TEMPFILE="$(mktemp /tmp/firewallHook.XXXXXX)"
    export FW_HOOK_TEMPFILE
    cat > "$FW_HOOK_TEMPFILE"
    FW_HOOK_BOOTSTRAPPED=1 exec /bin/bash "$FW_HOOK_TEMPFILE"
fi

if [ -n "${FW_HOOK_TEMPFILE:-}" ]; then
    trap 'rm -f "$FW_HOOK_TEMPFILE"' EXIT
fi

INSTALL_DIR="/kloudust/system/libvirt-hooks"
INSTALL_FILE="$INSTALL_DIR/qemu"
STATE_DIR="/kloudust/system/firewall-state"

echoerr() { echo "$@" 1>&2; }

function deleteChainsByComment() {
    local COMMENT="$1"
    # Remove any existing chains for this VM/ruleset before rebuilding them.
    # This keeps the reapply path idempotent if the hook runs more than once.
    while read -r FAMILY TABLE CHAIN; do
        if [ -z "$FAMILY" ] || [ -z "$TABLE" ] || [ -z "$CHAIN" ]; then continue; fi
        nft delete chain "$FAMILY" "$TABLE" "$CHAIN" 2>/dev/null || true
    done < <(nft -j list ruleset | jq -r --arg comment "$COMMENT" '
      .nftables[] | select(.chain) | .chain |
      select(.comment == $comment) |
      "\(.family) \(.table) \(.name)"
    ')
}

function reapplyFirewallState() {
    local HOOK_VM_NAME="$1"
    local STATE_FILE="$2"
    local DOMAIN_XML="$3"
    if [ ! -f "$STATE_FILE" ]; then return 0; fi

    # Rebuild one VM/VNet firewall from the saved state file and the live XML.
    # shellcheck disable=SC1090
    . "$STATE_FILE" || { echoerr "Unable to read firewall state file $STATE_FILE"; return 0; }
    if [ -z "$FW_VM_NAME" ] || [ -z "$FW_VNET_ID" ] || [ -z "$FW_RULESET_NAME" ] || [ -z "$FW_RULES_JSON_B64" ]; then
        echoerr "Incomplete firewall state in $STATE_FILE, skipping."
        return 0
    fi
    if [ "$FW_VM_NAME" != "$HOOK_VM_NAME" ]; then return 0; fi

    local RULES_JSON BR_NAME MAC_ADDRESS HOST_MAC VNET_IFACE EGRESS_CHAIN INGRESS_CHAIN COMMENT
    RULES_JSON="$(printf '%s' "$FW_RULES_JSON_B64" | base64 -d 2>/dev/null)"
    if [ -z "$RULES_JSON" ]; then
        echoerr "Unable to decode firewall rules for $FW_VM_NAME from $STATE_FILE, skipping."
        return 0
    fi

    BR_NAME="kd${FW_VNET_ID}_br"
    # Use the domain XML libvirt passed on stdin so reapply stays in-hook.
    MAC_ADDRESS=""
    if [ -n "$DOMAIN_XML" ]; then
        MAC_ADDRESS="$(printf '%s' "$DOMAIN_XML" | xmllint --xpath \
            "string(//interface[@type='bridge'][source/@bridge='$BR_NAME']/mac/@address)" - 2>/dev/null)"
    fi
    if [ -z "$MAC_ADDRESS" ]; then
        echoerr "Could not locate MAC for $FW_VM_NAME on bridge $BR_NAME from domain XML, skipping firewall reapply."
        return 0
    fi

    HOST_MAC="$(echo "$MAC_ADDRESS" | sed 's/^../fe/')"
    VNET_IFACE=""
    for _ in 1 2 3 4 5; do
        VNET_IFACE="$(ip -br link | awk -v mac="$HOST_MAC" 'tolower($3) == tolower(mac) {print $1; exit}')"
        [ -n "$VNET_IFACE" ] && break
        sleep 1
    done
    if [ -z "$VNET_IFACE" ]; then
        echoerr "Could not find host vnet interface for firewall reapply of $FW_VM_NAME on VNet $FW_VNET_ID"
        return 0
    fi

    EGRESS_CHAIN="kd_$(echo "${FW_RULESET_NAME}_${FW_VM_NAME}_${FW_VNET_ID}_e" | md5sum | cut -c1-24)_e"
    INGRESS_CHAIN="kd_$(echo "${FW_RULESET_NAME}_${FW_VM_NAME}_${FW_VNET_ID}_i" | md5sum | cut -c1-24)_i"
    COMMENT="$FW_RULESET_NAME-$FW_VM_NAME-$FW_VNET_ID"
    nft add table netdev kdhostfirewall_netdev 2>/dev/null || true
    deleteChainsByComment "$COMMENT"

    if ! nft add chain netdev kdhostfirewall_netdev "$EGRESS_CHAIN" \
        { type filter hook egress device \"$VNET_IFACE\" priority 0\; policy accept\; comment \"$COMMENT\"\; }; then
        echoerr "Could not recreate egress firewall chain for $FW_VM_NAME on $VNET_IFACE"
        return 0
    fi

    if ! nft add chain netdev kdhostfirewall_netdev "$INGRESS_CHAIN" \
        { type filter hook ingress device \"$VNET_IFACE\" priority 0\; policy accept\; comment \"$COMMENT\"\; }; then
        echoerr "Could not recreate ingress firewall chain for $FW_VM_NAME on $VNET_IFACE"
        return 0
    fi

    if ! nft add rule netdev kdhostfirewall_netdev "$EGRESS_CHAIN" ether type arp accept comment "$COMMENT"; then return 0; fi
    if ! nft add rule netdev kdhostfirewall_netdev "$INGRESS_CHAIN" ether type arp accept comment "$COMMENT"; then return 0; fi

    while read -r RULE; do
        DIRECTION="$(echo "$RULE" | jq -r '.direction')"
        ALLOW="$(echo "$RULE" | jq -r '.allow')"
        PROTOCOL="$(echo "$RULE" | jq -r '.protocol')"
        PORT="$(echo "$RULE" | jq -r '.port')"
        IP="$(echo "$RULE" | jq -r '.ip')"

        ACTION="drop"
        if [ "$ALLOW" = "true" ]; then ACTION="accept"; fi

        PORT_MATCH=""
        if { [ "$PROTOCOL" = "tcp" ] || [ "$PROTOCOL" = "udp" ]; } && [ -n "$PORT" ] && [ "$PORT" != "*" ] && [ "$PORT" != "null" ]; then
            PORT_MATCH="$PROTOCOL dport $PORT"
        elif { [ "$PROTOCOL" = "tcp" ] || [ "$PROTOCOL" = "udp" ]; } && [ "$PORT" = "*" ]; then
            PORT_MATCH="meta l4proto $PROTOCOL"  
        fi

        IP_MATCH=""
        if [ "$DIRECTION" = "in" ]; then
            CHAIN="$EGRESS_CHAIN"
            if [ "$IP" != "*" ] && [ "$IP" != "null" ]; then IP_MATCH="ip saddr $IP"; fi
        else
            CHAIN="$INGRESS_CHAIN"
            if [ "$IP" != "*" ] && [ "$IP" != "null" ]; then IP_MATCH="ip daddr $IP"; fi
        fi

        if ! nft add rule netdev kdhostfirewall_netdev "$CHAIN" \
                $IP_MATCH $PORT_MATCH counter $ACTION comment "$COMMENT"; then
            echoerr "Could not recreate firewall rule for $FW_VM_NAME from $STATE_FILE"
            return 0
        fi
    done < <(echo "$RULES_JSON" | jq -c '.[]')

    if ! nft list ruleset > /etc/nftables.conf; then
        echoerr "Could not persist reapplied firewall rules for $FW_VM_NAME"
        return 0
    fi
    systemctl enable nftables >/dev/null 2>&1 || true

    echo "Netdev egress+ingress firewall rules reapplied for $FW_VM_NAME, ruleset $FW_RULESET_NAME and Vnet $FW_VNET_ID"
}

# The SSH fallback transport used by host init does not preserve argv, so the
# installer arrives with no shell arguments. Treat that as install mode too.
if [ "${1:-}" = "install" ] || [ $# -eq 0 ]; then
    # Host bootstrap installs the hook once and publishes it at libvirt's
    # expected hook path.
    if ! sudo mkdir -p "$INSTALL_DIR"; then exit 1; fi
    if ! sudo mkdir -p "$STATE_DIR"; then exit 1; fi
    if ! sudo mkdir -p /etc/libvirt/hooks; then exit 1; fi
    if ! sudo cp "$0" "$INSTALL_FILE"; then exit 1; fi
    if ! sudo chmod 755 "$INSTALL_FILE"; then exit 1; fi
    if ! sudo ln -sfn "$INSTALL_FILE" /etc/libvirt/hooks/qemu; then exit 1; fi
    echo "Libvirt qemu firewall hook installed."
    exit 0
fi

HOOK_VM_NAME="$1"
HOOK_OPERATION="$2"
HOOK_SUBOPERATION="$3"

if [ -z "$HOOK_VM_NAME" ] || [ -z "$HOOK_OPERATION" ] || [ -z "$HOOK_SUBOPERATION" ]; then
    exit 0
fi

DOMAIN_XML=""
if [ ! -t 0 ]; then
    DOMAIN_XML="$(cat)"
fi

# Only VM start and libvirt reconnect events should trigger firewall restore.
case "$HOOK_OPERATION/$HOOK_SUBOPERATION" in
    started/begin|reconnect/begin) ;;
    *) exit 0 ;;
esac

if [ -d "$STATE_DIR" ]; then
    # Replay only the saved firewall state for this host's VMs.
    shopt -s nullglob
    for STATE_FILE in "$STATE_DIR"/*.state; do
        reapplyFirewallState "$HOOK_VM_NAME" "$STATE_FILE" "$DOMAIN_XML"
    done
    shopt -u nullglob
fi

exit 0
