#!/bin/bash

#########################################################################################################
# Runs commands inside the VM as root via qemu-guest-agent. The Qemu guest agent must be installed and
# running inside the VM.
# (C) 2025 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#
# Params
# {1} VM Name
# {2...} Command and arguments for Bash shell
#########################################################################################################

VM=$1
ARGS="${@:2}"

PID=$(virsh -c qemu:///system qemu-agent-command $VM '{"execute": "guest-exec", "arguments": { "path": "/bin/bash", "arg": [ "-c", "'"$ARGS"'" ], "capture-output": true }}' | jq -r '.return.pid')
sleep 1
virsh -c qemu:///system qemu-agent-command $VM '{"execute": "guest-exec-status", "arguments": {"pid": '$PID'}}' | jq -r '.return["out-data"]' | base64 --decode