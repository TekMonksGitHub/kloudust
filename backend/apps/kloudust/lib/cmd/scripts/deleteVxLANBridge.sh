#!/bin/bash

#########################################################################################################
# Deletes the given VxLAN on the host. Re-entry safe. 
# (C) 2024 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#
# Params
# {1} VLAN Name
#########################################################################################################
VLAN_NAME={1}
VXLAN_BOOT_SCRIPT=/kloudust/system/10vxlan_"$VLAN_NAME".sh

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed.
    exit 1
}

if [ "`ip link | grep "$VLAN_NAME":`" ]; then                                  # this deletes the VxLAN to match VLAN name 
    if ! ip link delete $VLAN_NAME; then exitFailed; fi 	
    echo Deleted the VxLAN $VLAN_NAME 
else
    echo Skipped deleting VxLAN $VLAN_NAME as it already doesn not exist
fi

if [ "`ip link | grep "$BR_NAME":`" ]; then                                    # deletes the default VLAN bridge if it exists
    if ! ip link delete $BR_NAME; then exitFailed; fi  
    echo Deleted bridge $BR_NAME
else
    echo Skipped deleting bridge $BR_NAME as it already does not exist
fi

rm $VXLAN_BOOT_SCRIPT                                                          # remove from boot 
echo Done.