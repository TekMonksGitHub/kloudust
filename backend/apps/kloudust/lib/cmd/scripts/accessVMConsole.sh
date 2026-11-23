#!/bin/bash

# Params
# {1} - VM name
# {2} - Operation - connect or close
# {3} - VNC password, only used for connect
# {4} - JSON out splitter
# {5} - VNC password expiry in seconds, only used for connect
# {6} - The console proxy's IP, the only address allowed to connect, only used for connect

VM_NAME="{1}"
OPERATION="{2}"
PASSWORD="{3}"
JSONOUT_SPLITTER="{4}"
PASSWORD_EXPIRY="{5}"
PROXY_IP="{6}"
RULE_COMMENT="kdconsole_$VM_NAME"
UNIT="kdconsole-$(systemd-escape "$VM_NAME")"
CERT=/kloudust/etc/kdconsole.crt
KEY=/kloudust/etc/kdconsole.key

function exitFailed() {
    echo "$1" >&2
    echo Failed
    exit 1
}

systemctl stop "$UNIT" > /dev/null 2>&1
for HANDLE in $(nft -a list chain inet kdhostfirewall input | grep "comment \"$RULE_COMMENT\"" | grep -o "handle [0-9]*" | cut -d" " -f2); do
    if ! nft delete rule inet kdhostfirewall input handle "$HANDLE"; then exitFailed "Unable to remove the console firewall rule"; fi
done

if [ "$OPERATION" == "close" ]; then
    virsh qemu-monitor-command --hmp "$VM_NAME" "expire_password vnc now" > /dev/null 2>&1
    echo "Console access closed for $VM_NAME"
    exit 0
fi

VNC_DISPLAY=$(virsh vncdisplay "$VM_NAME" 2>/dev/null | grep -o ":[0-9]\+$" | tr -d ":")
if [ -z "$VNC_DISPLAY" ]; then exitFailed "Console is not enabled for $VM_NAME or it is not running"; fi
if [ -z "$PROXY_IP" ]; then exitFailed "VNC_PROXY_IP is not configured"; fi

if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    if ! (umask 077; openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=$(hostname)" -keyout "$KEY" -out "$CERT" 2>/dev/null); then
        exitFailed "Unable to create the console certificate"
    fi
fi

HMP_ERRORS=$(virsh qemu-monitor-command --hmp "$VM_NAME" "change vnc password $PASSWORD" 2>&1; virsh qemu-monitor-command --hmp "$VM_NAME" "expire_password vnc +$PASSWORD_EXPIRY" 2>&1)
if [ -n "$(echo "$HMP_ERRORS" | tr -d '[:space:]')" ]; then exitFailed "Unable to set the console password: $HMP_ERRORS"; fi

PORT=""
for CANDIDATE in $(seq 6080 6179); do
    if [ -z "$(ss -Hltn "sport = :$CANDIDATE")" ]; then PORT=$CANDIDATE; break; fi
done
if [ -z "$PORT" ]; then exitFailed "No free console port"; fi

HANDLE=$(nft --echo --handle insert rule inet kdhostfirewall input ip saddr "$PROXY_IP" tcp dport "$PORT" accept comment "\"$RULE_COMMENT\"" | grep -o "handle [0-9]*" | cut -d" " -f2)
if [ -z "$HANDLE" ]; then exitFailed "Unable to open the console firewall rule"; fi

if ! systemd-run --unit "$UNIT" --collect --quiet /bin/bash -c "websockify --run-once --timeout 60 --ssl-only --cert $CERT --key $KEY $PORT 127.0.0.1:$((5900+VNC_DISPLAY)); nft delete rule inet kdhostfirewall input handle $HANDLE"; then
    nft delete rule inet kdhostfirewall input handle "$HANDLE"
    exitFailed "Unable to start the console listener"
fi
sleep 1
if ! systemctl is-active --quiet "$UNIT"; then exitFailed "The console listener exited, see journalctl -u $UNIT"; fi

echo "Console access opened for $VM_NAME"
echo "$JSONOUT_SPLITTER"
echo "{\"port\": $PORT}"
exit 0
