#!/bin/bash

# Params
# {1}Router Name - no spaces

ROUTER_NAME="{1}"

ROUTER_BOOT_SCRIPT="/kloudust/system/hostinit/30router_${ROUTER_NAME}.sh"

function exitFailed() {
    echo Failed
    exit 1
}

if ! ip netns delete $ROUTER_NAME; then exitFailed; fi

rm $ROUTER_BOOT_SCRIPT
printf "\n\nRouter $ROUTER_NAME deleted successfully"
exit 0
