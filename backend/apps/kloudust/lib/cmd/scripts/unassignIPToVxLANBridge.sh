#!/bin/bash

#########################################################################################################
# Remove the IP from the VxLAN bridge. This script must be run on the host where the IP to be assigned
# actually terminates. It will then route traffic to the VxLAN bridge for this IP. 
#
# (C) 2026 Tekmonks. All rights reserved.
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

ASSIGN_IP_BOOT_SCRIPT="/kloudust/system/20assign_${IP_ADDRESS_DASHED}.sh"

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed
    exit 1
}

if ! ip route del $IP_ADDRESS/32 dev $BR_NAME; then exitFailed; fi       # Add new route

rm $ASSIGN_IP_BOOT_SCRIPT

echo Done.