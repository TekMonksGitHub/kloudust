#!/bin/bash

# Params
# {1} Load Balancer Name

LB_NAME="{1}"
LB_BOOT_SCRIPT="/kloudust/system/hostinit/30loadbalancer_${LB_NAME}.sh"

function exitFailed() {
    echo Failed
    exit 1
}

if ! ip netns delete $LB_NAME; then exitFailed; fi

rm -f $LB_BOOT_SCRIPT
printf "\n\nLoad balancer $LB_NAME deleted successfully"
exit 0
