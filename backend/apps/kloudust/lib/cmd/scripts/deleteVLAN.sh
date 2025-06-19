#!/bin/bash

#########################################################################################################
# VLAN deletion script for Kloudust. Re-entry safe. 
# (C) 2024 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#
# Params
# {1} VLAN Name
#########################################################################################################
VLAN_NAME={1}
BR_NAME="$1"_br

echoerr() { echo "$@" 1>&2; }

function exitFailed() {
    echo Failed.
    exit 1
}

if ! ip link del $BR_NAME; then exitFailed; fi
if ! ip link del $VLAN_NAME; then exitFailed; fi

echo Done.