#!/bin/bash

# Removes the StrongSwan IKEv2 tunnel for VxLAN UDP traffic to one peer.
# Params: {1} peer host IP
PEER_HOST={1}
CONNECTION_NAME="kd-vxlan-${PEER_HOST//[^A-Za-z0-9]/_}"
IPSEC=ipsec; IPSEC_ETC=/etc    # RHEL family ships the starter as "strongswan" with configs under /etc/strongswan
if ! command -v ipsec > /dev/null && command -v strongswan > /dev/null; then IPSEC=strongswan; IPSEC_ETC=/etc/strongswan; fi
CONFIG_FILE="$IPSEC_ETC/ipsec.d/kloudust/${CONNECTION_NAME}.conf"
SECRETS_FILE=$IPSEC_ETC/ipsec.secrets

function exitFailed() {
    echo Failed.
    exit 1
}

LOCAL_HOST=$(ip route get "$PEER_HOST" | awk '/ src / {for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}')
if [ -z "$LOCAL_HOST" ]; then exitFailed; fi

sudo $IPSEC unroute "$CONNECTION_NAME" > /dev/null 2>&1 || true
sudo $IPSEC down "$CONNECTION_NAME" > /dev/null 2>&1 || true
if ! sudo rm -f "$CONFIG_FILE"; then exitFailed; fi
if [ -f "$SECRETS_FILE" ] && ! sudo sed -i "/^$LOCAL_HOST $PEER_HOST : PSK /d" "$SECRETS_FILE"; then exitFailed; fi
sudo $IPSEC rereadsecrets > /dev/null 2>&1 || true
sudo $IPSEC update > /dev/null 2>&1 || true
echo Done.
