#!/bin/bash

#########################################################################################################
# Assigns the IP to the VM's mac attached to the given VxLAN. Re-entry safe. Network Manager must be 
# installed for Linux VMs for persistent IP assignments. The Linux image should have nmcli command 
# available for persistent IP changes. Else IP command will be used which does not survive reboots.
#
# (C) 2024 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#
# Params
# {1} VM name 
# {2} VxLAN name (not used)
# {3} VxLAN ID (it is a number)
# {4} IP address
# {5} MTU for the VM
# {6} Is Windows - if set VM is a Windows VM else Linux
#########################################################################################################
VM_NAME={1}
VLAN_NAME=kd{3}
IP_ADDRESS={4}
MTUIN={5}
IS_WINDOWS_VM={6}
BR_NAME="$VLAN_NAME"_br
MTU=${MTUIN:-1200}

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed
    exit 1
}

MAC_ADDRESS=`virsh domiflist $VM_NAME | grep $BR_NAME | xargs | cut -d" " -f5`
if [ -z "$MAC_ADDRESS" ]; then 
    echoerr Could not locate MAC for the VM $VM_NAME attached to the VxLAN $VLAN_NAME or already detached, skipping.
    exitFailed
else
    echo Found $MAC_ADDRESS for VM attachment to the VxLAN. Proceeding with IP setup.
fi

if [ -z "$IS_WINDOWS_VM" ]; then
    # This is for Linux, uses nmcli first, falls back to ip command
    if ! virsh qemu-agent-command VM_NAME '{"execute":"guest-exec","arguments":{"path":"/bin/bash","arg":["-c","IFACE=$(ip link show | grep -B1 $MAC_ADDRESS | head -1 | awk -F: \"{print \\$2}\" | tr -d \" \"); if [ -z \"$IFACE\" ]; then echo \"Interface with MAC $MAC_ADDRESS not found\"; exit 1; fi; if command -v nmcli >/dev/null 2>&1; then echo \"Configuring with Network Manager.\"; nmcli con delete static-$IFACE 2>/dev/null || true; nmcli con add type ethernet ifname $IFACE con-name static-$IFACE ipv4.addresses $IP_ADDRESS/24 ipv4.method manual autoconnect yes ethernet.mtu $MTU; nmcli con up static-$IFACE; else echo \"Network Manager not found, using ip commands, changes will not persist reboot.\"; ip addr flush dev $IFACE; ip addr add $IP_ADDRESS/24 dev $IFACE; ip link set mtu $MTU dev $IFACE; ip link set $IFACE up; fi; echo \"Configuration complete for interface $IFACE\""],"capture-output":true}}'; then exitFailed; fi
else 
    # This is for Windows VMs
    if ! virsh qemu-agent-command VM_NAME '{"execute":"guest-exec","arguments":{"path":"powershell","arg":["-Command","$mac=\"$MAC_ADDRESS\"; $adapter = Get-NetAdapter | Where-Object {$_.MacAddress -eq $mac}; New-NetIPAddress -InterfaceIndex $adapter.InterfaceIndex -IPAddress \"$IP_ADDRESS\" -PrefixLength 24; Set-NetAdapterAdvancedProperty -Name $adapter.Name -DisplayName \"Jumbo Packet\" -DisplayValue \"$MTU\" -ErrorAction SilentlyContinue; netsh interface ipv4 set subinterface $adapter.InterfaceIndex mtu=$MTU store=persistent"],"capture-output":true}}'; then exitFailed; fi
fi
echo Done.