#!/bin/bash

#########################################################################################################
# Unassigns the IP from the VM attached to the given VxLAN.
# Uses QEMU Guest Agent.
#
# (C) 2026 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Params
# {1} VM name
# {2} VxLAN name (not used)
# {3} VxLAN ID (number)
# {4} IP address to unassign
#########################################################################################################

VM_NAME={1}
VLAN_NAME=kd{3}
IP_ADDRESS={4}
BR_NAME="$VLAN_NAME"_br

IS_WINDOWS=""
if virsh dumpxml "$VM_NAME" | grep -qE 'microsoft\.com/win|windows'; then IS_WINDOWS="true"; fi

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed
    exit 1
}


IP_ADDRESS_UNDERSCORES="${IP_ADDRESS//./_}"

# Linux guest script (Netplan)
LINUX_NETPLAN_SCRIPT='
NETPLAN_FILE="/etc/netplan/99-kd-ip-'${IP_ADDRESS_UNDERSCORES}'.yaml"

if [ -f "$NETPLAN_FILE" ]; then
    rm -f "$NETPLAN_FILE"
    netplan apply
    if [ $? -eq 0 ]; then
        echo "Removed Netplan config and unassigned IP '${IP_ADDRESS}'"
    else
        echo "Failed to reapply Netplan after removing IP '${IP_ADDRESS}'"
    fi
else
    echo "Netplan file not found for IP '${IP_ADDRESS}', nothing to do."
fi
'

# Windows guest script (PowerShell)
WINDOWS_PS_SCRIPT="
\$ipEntry = Get-NetIPAddress -IPAddress '$IP_ADDRESS' -ErrorAction SilentlyContinue

if (\$ipEntry) {
    foreach (\$ip in \$ipEntry) {
        Remove-NetIPAddress -InterfaceIndex \$ip.InterfaceIndex -IPAddress '$IP_ADDRESS' -Confirm:\$false
        Write-Output \"Removed IP '$IP_ADDRESS' from interface index \$($ip.InterfaceIndex)\"
    }
} else {
    Write-Output \"IP '$IP_ADDRESS' not found on any interface\"
}
"

# Build JSON payloads
JSON_PAYLOAD_LINUX=$(jq -n --arg script "$LINUX_NETPLAN_SCRIPT" \
    '{execute: "guest-exec", arguments: {path: "/bin/bash", arg: ["-c", $script], "capture-output": true}}')

JSON_PAYLOAD_WINDOWS=$(jq -n --arg script "$WINDOWS_PS_SCRIPT" \
    '{execute: "guest-exec", arguments: {path: "powershell", arg: ["-Command", $script], "capture-output": true}}')

# Execute inside guest
if [ -z "$IS_WINDOWS" ]; then
    echo "Using Netplan cleanup script for Linux VM"
    if ! PID=$(virsh qemu-agent-command "$VM_NAME" "$JSON_PAYLOAD_LINUX" | jq -r '.return.pid'); then
        exitFailed
    fi
else
    echo "Using PowerShell cleanup script for Windows VM"
    if ! PID=$(virsh qemu-agent-command "$VM_NAME" "$JSON_PAYLOAD_WINDOWS" | jq -r '.return.pid'); then
        exitFailed
    fi
fi

sleep 2

virsh qemu-agent-command "$VM_NAME" '{"execute": "guest-exec-status", "arguments": {"pid": '"$PID"'}}' | jq -r '.return["out-data"]' | base64 --decode

echo Done.
