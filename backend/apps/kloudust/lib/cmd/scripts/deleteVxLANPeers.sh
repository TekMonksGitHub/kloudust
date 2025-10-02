#!/bin/bash

#########################################################################################################
# Deletes additional forwarding hosts to the given VxLAN. The VxLAN must exist on this host already.
# (C) 2024 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#
# Params
# {1} VLAN Name (not used currently)
# {2} VLAN ID (it is a number)
# {3} Peer host IPs as a list eg "192.168.1.1 192.168.1.2 ..."
#########################################################################################################
VLAN_NAME=kd{2}
PEER_HOSTS={3}

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    message="$@"
    if [ -n "$message" ]; then echoerr "$message"; fi
    echo Failed.
    exit 1
}

if ! ip link show | grep $VLAN_NAME; then exitFailed "Failed to locate VxLAN $VLAN_NAME"; fi  

DEFAULT_ETH=`ip route | grep default | grep -o 'dev.*' | cut -d" " -f2`
if [ -n "$PEER_HOSTS" ]; then 
	for PEER_HOST in $PEER_HOSTS; do                                             # VxLAN unicast to the VTEPs
        if ! bridge fdb del to 00:00:00:00:00:00 dst $PEER_HOST dev $VLAN_NAME; then exitFailed; fi   
        echo Deleted VTeP peering $DEFAULT_ETH '->' $PEER_HOST for VxLAN $VLAN_NAME
    done 
fi
