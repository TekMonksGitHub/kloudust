#!/bin/bash

#########################################################################################################
# Assigns the IP to the VxLAN bridge. This script must be run on the host where the IP to be assigned
# actually terminates. It will then route traffic to the VxLAN bridge for this IP. 
#
# (C) 2025 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#
# Params
# {1} VxLAN name (not used)
# {2} VxLAN ID (it is a number)
# {3} IP address
#########################################################################################################
VLAN_NAME=kd{2}
IP_ADDRESS={3}
BR_NAME="$VLAN_NAME"_br

IP_ADDRESS_DASHED=$(echo "$IP_ADDRESS" | tr '.' '-')

SCRIPT_PATH=$(readlink -f "$0")
ASSIGN_IP_BOOT_SCRIPT="/kloudust/system/20assign_${IP_ADDRESS_DASHED}.sh"

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed
    rm $ASSIGN_IP_BOOT_SCRIPT
    exit 1
}

ip route del $IP_ADDRESS/24                                              # Remove any existing routes
ip route del $IP_ADDRESS/32                                              # Remove any existing routes
if ! ip route add $IP_ADDRESS/32 dev $BR_NAME; then exitFailed; fi       # Add new route

cp $SCRIPT_PATH $ASSIGN_IP_BOOT_SCRIPT                                               # Ensure we survive a boot
chmod +x $ASSIGN_IP_BOOT_SCRIPT

echo Done.