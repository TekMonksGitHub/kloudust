#!/bin/bash

#########################################################################################################
# Removes the IP from the VM attached to the given VNet. Re-entry safe. Network Manager must be
# installed for Linux VMs for persistent IP assignments. The Linux image should have netplan support
# available for persistent IP changes. 
#
# (C) 2026 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#
# Params
# {1} VM name
# {2} VNet name
# {3} VNet ID (it is a number)
# {4} IP address
# {5} MTU for the VM, set to 1200 if not given
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

MAC_ADDRESS=`virsh dumpxml $VM_NAME | xmllint --xpath "string(//interface[@type='bridge'][source/@bridge='$BR_NAME']/mac/@address)" -`
if [ -z "$MAC_ADDRESS" ]; then
    echoerr Could not locate MAC for the VM $VM_NAME attached to VNet $VLAN_NAME or already detached, skipping.
    exitFailed
else
    echo Found $MAC_ADDRESS for VM attached to the VNet. Proceeding with IP removal.
fi

IP_ADDRESS_UNDERSCORES="${IP_ADDRESS//./_}"

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
# Use jq to properly escape and build the JSON
JSON_PAYLOAD_LINUX=$(jq -n --arg script "$LINUX_NETPLAN_SCRIPT" \
	'{execute: "guest-exec", arguments: {path: "/bin/bash", arg: ["-c", $script], "capture-output": true}}')

JSON_PAYLOAD_WINDOWS=$(jq -n --arg script "$WINDOWS_PS_SCRIPT" \
        '{execute: "guest-exec", arguments: {path: "powershell", arg: ["-Command", $script], "capture-output": true}}')


if [ -z "$IS_WINDOWS_VM" ]; then
    # This is for Linux, uses netplan
    echo Using this Netplan script for Linux VM: $LINUX_NETPLAN_SCRIPT
    if ! PID=$(virsh qemu-agent-command $VM_NAME $JSON_PAYLOAD_LINUX | jq -r '.return.pid'); then exitFailed; fi
else
    # This is for Windows VMs
    echo Using this Powershell script for Windows VM: $WINDOWS_PS_SCRIPT
    if ! PID=$(virsh qemu-agent-command $VM_NAME $JSON_PAYLOAD_WINDOWS | jq -r '.return.pid'); then exitFailed; fi
fi

sleep 2
virsh -c qemu:///system qemu-agent-command $VM_NAME '{"execute": "guest-exec-status", "arguments": {"pid": '$PID'}}' | jq -r '.return["out-data"]' | base64 --decode

echo Done.
