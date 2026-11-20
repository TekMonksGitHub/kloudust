#!/bin/bash

# Runs on the Kloudust server, not the host. Prints the CA certificate, host certificate
# and host key as base64 encoded PEMs, one per line.
# Params
# $1 The Kloudust CA folder, the CA is created here on first use
# $2 The host's IP address
# $3 Validity of the host certificate in days

CA_DIR="$1"
HOST_IP="$2"
CERT_DAYS="$3"

set -e
if [ ! -f "$CA_DIR/ca-cert.pem" ] || [ ! -f "$CA_DIR/ca-key.pem" ]; then
    mkdir -p -m 700 "$CA_DIR"
    openssl req -x509 -newkey rsa:3072 -nodes -days 7300 -subj "/CN=Kloudust CA" -keyout "$CA_DIR/ca-key.pem" -out "$CA_DIR/ca-cert.pem"
    chmod 600 "$CA_DIR/ca-key.pem"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
printf "basicConstraints = CA:FALSE\nkeyUsage = critical, digitalSignature, keyEncipherment\nextendedKeyUsage = serverAuth\nsubjectAltName = IP:%s\n" "$HOST_IP" > "$TMP_DIR/ext.cnf"
openssl req -newkey rsa:2048 -nodes -subj "/CN=$HOST_IP" -keyout "$TMP_DIR/key.pem" -out "$TMP_DIR/req.csr"
openssl x509 -req -in "$TMP_DIR/req.csr" -CA "$CA_DIR/ca-cert.pem" -CAkey "$CA_DIR/ca-key.pem" -set_serial "0x$(openssl rand -hex 16)" \
    -days "$CERT_DAYS" -extfile "$TMP_DIR/ext.cnf" -out "$TMP_DIR/cert.pem"

for PEM in "$CA_DIR/ca-cert.pem" "$TMP_DIR/cert.pem" "$TMP_DIR/key.pem"; do openssl base64 -A -in "$PEM"; echo; done
