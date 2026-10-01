#!/bin/bash

# Configures a StrongSwan IKEv2 tunnel for VxLAN UDP traffic to one peer.
# Params: {1} peer host IP, {2} base64-encoded common PSK
PEER_HOST={1}
PSK_BASE64={2}
CONNECTION_NAME="kd-vxlan-${PEER_HOST//[^A-Za-z0-9]/_}"
IPSEC=ipsec; IPSEC_ETC=/etc    # RHEL family ships the starter as "strongswan" with configs under /etc/strongswan
if ! command -v ipsec > /dev/null && command -v strongswan > /dev/null; then IPSEC=strongswan; IPSEC_ETC=/etc/strongswan; fi
CONFIG_DIR=$IPSEC_ETC/ipsec.d/kloudust
CONFIG_FILE="$CONFIG_DIR/$CONNECTION_NAME.conf"
SECRETS_FILE=$IPSEC_ETC/ipsec.secrets

function exitFailed() {
    echo Failed.
    exit 1
}

LOCAL_HOST=$(ip route get "$PEER_HOST" | awk '/ src / {for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}')
PSK=$(printf '%s' "$PSK_BASE64" | base64 --decode) || exitFailed
if [ -z "$LOCAL_HOST" ] || [ -z "$PSK" ]; then exitFailed; fi

if ! sudo mkdir -p "$CONFIG_DIR"; then exitFailed; fi
if ! sudo grep -qxF "include $CONFIG_DIR/*.conf" $IPSEC_ETC/ipsec.conf; then
    if ! echo "include $CONFIG_DIR/*.conf" | sudo tee -a $IPSEC_ETC/ipsec.conf > /dev/null; then exitFailed; fi
fi
sudo tee "$CONFIG_FILE" > /dev/null <<EOF_CONFIG
conn $CONNECTION_NAME
    keyexchange=ikev2
    type=transport
    authby=psk
    left=$LOCAL_HOST
    leftid=$LOCAL_HOST
    leftprotoport=udp
    right=$PEER_HOST
    rightid=$PEER_HOST
    rightprotoport=udp
    ike=aes256-sha384-ecp384!
    esp=aes256gcm16-ecp384!
    auto=route
EOF_CONFIG
if [ $? -ne 0 ]; then exitFailed; fi
PSK_ESCAPED=$(printf '%s' "$PSK" | sed 's/[\\"]/\\&/g')
sudo sed -i "/^$LOCAL_HOST $PEER_HOST : PSK /d" "$SECRETS_FILE"
if ! printf '%s %s : PSK "%s"\n' "$LOCAL_HOST" "$PEER_HOST" "$PSK_ESCAPED" | sudo tee -a "$SECRETS_FILE" > /dev/null; then exitFailed; fi
if ! sudo $IPSEC status > /dev/null 2>&1; then sudo $IPSEC start; sleep 2; fi
if ! sudo $IPSEC rereadsecrets; then exitFailed; fi
if ! sudo $IPSEC update; then exitFailed; fi
sudo $IPSEC route "$CONNECTION_NAME" > /dev/null 2>&1
if ! sudo $IPSEC status "$CONNECTION_NAME" | grep -qE "ROUTED|INSTALLED"; then exitFailed; fi
echo Done.
