#!/bin/bash

# Params
# {1} - VM name
# {2} - Operation - connect or close
# {3} - VNC password, only used for connect
# {4} - JSON out splitter
# {5} - VNC password expiry in seconds, only used for connect

VM_NAME="{1}"
OPERATION="{2}"
PASSWORD="{3}"
JSONOUT_SPLITTER="{4}"
PASSWORD_EXPIRY="{5}"
RULE_COMMENT="kdconsole_$VM_NAME"

function exitFailed() {
    echo "$1" >&2
    echo Failed
    exit 1
}

for HANDLE in $(nft -a list chain inet kdhostfirewall input | grep "comment \"$RULE_COMMENT\"" | grep -o "handle [0-9]*" | cut -d" " -f2); do
    if ! nft delete rule inet kdhostfirewall input handle "$HANDLE"; then exitFailed "Unable to remove the console firewall rule"; fi
done

PORT=$(virsh dumpxml "$VM_NAME" | grep -o "websocket='[0-9]*'" | head -n1 | grep -o "[0-9]\+")

if [ "$OPERATION" == "close" ]; then
    if [ -n "$PORT" ]; then ss -K state established "( sport = :$PORT )" > /dev/null; fi   # established sessions survive the rule removal
    virsh qemu-monitor-command --hmp "$VM_NAME" "expire_password vnc now" > /dev/null 2>&1
    echo "Console access closed for $VM_NAME"
    exit 0
fi

if [ -z "$PORT" ]; then exitFailed "Console is not enabled for $VM_NAME or it is not running"; fi

HMP_ERRORS=$(virsh qemu-monitor-command --hmp "$VM_NAME" "change vnc password $PASSWORD" 2>&1; virsh qemu-monitor-command --hmp "$VM_NAME" "expire_password vnc +$PASSWORD_EXPIRY" 2>&1)
if [ -n "$(echo "$HMP_ERRORS" | tr -d '[:space:]')" ]; then exitFailed "Unable to set the console password: $HMP_ERRORS"; fi

if ! nft insert rule inet kdhostfirewall input tcp dport "$PORT" accept comment "\"$RULE_COMMENT\""; then exitFailed "Unable to open the console firewall rule"; fi

echo "Console access opened for $VM_NAME"
echo "$JSONOUT_SPLITTER"
echo "{\"port\": $PORT}"
exit 0
