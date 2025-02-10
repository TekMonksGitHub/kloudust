USER_ID="{1}"
BUCKET_POLICY_NAME="{2}"
MINIO_ROOT_USER="{3}"
MINIO_ROOT_PASSWORD="{4}"
PORT="{5}"
VM_NAME="{6}"

if mcli --version &>/dev/null; then
    echo "mcli is already installed."
else
    echo "mcli is not installed. Installing now..."
    sudo wget https://dl.min.io/client/mc/release/linux-amd64/mc -O mc
    sudo mv mc /usr/local/bin/mcli
    sudo chmod +x /usr/local/bin/mcli
    echo "mcli has been successfully installed."
fi

VM_IP=$(virsh net-dhcp-leases default | grep "$VM_NAME" | awk '{print $5}' | cut -d '/' -f 1);

mcli alias list | grep -q kdadmin
if [ $? -eq 1 ]; then
    mcli alias set kdadmin "http://$VM_IP:$PORT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
    if [ $? -eq 0 ]; then
        echo "Alias set successfully. Exiting loop."
    fi
    if [ $? -eq 1 ]; then
        echo "Failed to set admin alias"
        exit 1
    fi
fi

if mcli alias list | grep -q kdadmin; then
    if mcli admin user info kdadmin "$USER_ID" | grep -q "$BUCKET_POLICY_NAME"; then
        mcli admin policy detach kdadmin "$BUCKET_POLICY_NAME" --user "$USER_ID"
        mcli admin policy remove kdadmin "$BUCKET_POLICY_NAME"
    else
        echo Error! bucket not found.
        echo Failed
        exit 1
    fi
else
    echo Failed
    exit 1
fi