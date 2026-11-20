#!/bin/bash

# Runs on the Kloudust server, not the host. Prints the CA certificate, host certificate
# and host key as base64 encoded PEMs, one per line. Also creates the console proxy's client
# certificate (proxy-cert.pem, proxy-key.enc) in the CA folder if it is missing.
# Params
# $1 The Kloudust CA folder, the CA is created here on first use
# $2 The host's IP address
# $3 Validity of the host and client certificates in days
# $4 Monkshu's crypt.js, encrypts the client certificate's key with MONKSHU_CRYPT_KEY, which the frontend must share

CA_DIR="$1"
HOST_IP="$2"
CERT_DAYS="$3"
CRYPT_JS="$4"

set -e
if [ ! -f "$CA_DIR/ca-cert.pem" ] || [ ! -f "$CA_DIR/ca-key.pem" ]; then
    mkdir -p -m 700 "$CA_DIR"
    openssl req -x509 -newkey rsa:3072 -nodes -days 7300 -subj "/CN=Kloudust CA" -keyout "$CA_DIR/ca-key.pem" -out "$CA_DIR/ca-cert.pem"
    chmod 600 "$CA_DIR/ca-key.pem"
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
if [ ! -f "$CA_DIR/proxy-cert.pem" ] || [ ! -f "$CA_DIR/proxy-key.enc" ]; then
    printf "basicConstraints = CA:FALSE\nkeyUsage = critical, digitalSignature\nextendedKeyUsage = clientAuth\n" > "$TMP_DIR/proxy-ext.cnf"
    openssl req -newkey rsa:2048 -nodes -subj "/CN=Kloudust console proxy" -keyout "$TMP_DIR/proxy-key.pem" -out "$TMP_DIR/proxy.csr"
    openssl x509 -req -in "$TMP_DIR/proxy.csr" -CA "$CA_DIR/ca-cert.pem" -CAkey "$CA_DIR/ca-key.pem" -set_serial "0x$(openssl rand -hex 16)" \
        -days "$CERT_DAYS" -extfile "$TMP_DIR/proxy-ext.cnf" -out "$CA_DIR/proxy-cert.pem"
    node -e 'const [cryptjs, key, out] = process.argv.slice(1), fs = require("fs");
        fs.writeFileSync(out, require(cryptjs).encrypt(fs.readFileSync(key), undefined, undefined, true), {mode: 0o600});' \
        "$CRYPT_JS" "$TMP_DIR/proxy-key.pem" "$CA_DIR/proxy-key.enc"
fi
printf "basicConstraints = CA:FALSE\nkeyUsage = critical, digitalSignature, keyEncipherment\nextendedKeyUsage = serverAuth\nsubjectAltName = IP:%s\n" "$HOST_IP" > "$TMP_DIR/ext.cnf"
openssl req -newkey rsa:2048 -nodes -subj "/CN=$HOST_IP" -keyout "$TMP_DIR/key.pem" -out "$TMP_DIR/req.csr"
openssl x509 -req -in "$TMP_DIR/req.csr" -CA "$CA_DIR/ca-cert.pem" -CAkey "$CA_DIR/ca-key.pem" -set_serial "0x$(openssl rand -hex 16)" \
    -days "$CERT_DAYS" -extfile "$TMP_DIR/ext.cnf" -out "$TMP_DIR/cert.pem"

for PEM in "$CA_DIR/ca-cert.pem" "$TMP_DIR/cert.pem" "$TMP_DIR/key.pem"; do openssl base64 -A -in "$PEM"; echo; done
