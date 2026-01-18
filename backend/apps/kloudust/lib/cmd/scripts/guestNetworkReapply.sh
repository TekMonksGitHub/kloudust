#!/bin/bash

VM_NAME="{1}"

echoerr() { echo "$@" 1>&2; }
exitFailed() { echo Failed; exit 1; }

LINUX_SCRIPT='
netplan apply
'

JSON_PAYLOAD=$(jq -n --arg script "$LINUX_SCRIPT" '
{
  "execute": "guest-exec",
  "arguments": {
    "path": "/bin/bash",
    "arg": ["-c", $script],
    "capture-output": true
  }
}')

PID=$(virsh qemu-agent-command "$VM_NAME" "$JSON_PAYLOAD" | jq -r '.return.pid') || exitFailed

sleep 2

STATUS=$(virsh qemu-agent-command "$VM_NAME" \
  "{\"execute\":\"guest-exec-status\",\"arguments\":{\"pid\":$PID}}")

EXITCODE=$(echo "$STATUS" | jq -r '.return.exitcode')

if [ "$EXITCODE" -eq 0 ]; then
    echo "$STATUS" | jq -r '.return["out-data"] // empty' | base64 --decode 2>/dev/null
else
    echoerr "Command failed inside VM (exit code $EXITCODE)"
    echo "$STATUS" | jq -r '.return["err-data"] // empty' | base64 --decode 2>/dev/null
    exit 1
fi

echo Done.
