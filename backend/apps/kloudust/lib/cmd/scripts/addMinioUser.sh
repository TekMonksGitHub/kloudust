VM_NAME="{1}"
MINIO_ROOT_USER="{2}"
MINIO_ROOT_PASSWORD="{3}"
BUCKET_NAME="{4}"
BUCKET_SIZE="{5}"
USER_ID="{6}"
PASSWORD="{7}"
UNIQUE_BUCKET_NAME="{8}"

VM_IP=$(virsh net-dhcp-leases default | grep "$VM_NAME" | awk '{print $5}' | cut -d '/' -f 1);

function policy_maker(){
    mcli quota set "kdadmin/$BUCKET_NAME" --size "$BUCKET_SIZE"Gi
    if [ $? -eq 1 ]; then
        echo "failed to set quota"
        exit 1
    fi
    mcli admin user ls kdadmin --json | grep -q "$USER_ID"
    if [ $? -eq 1 ]; then
        mcli admin user add kdadmin "$2" "$3"
    fi
    printf "{\n\t\"Version\": \"2012-10-17\",\n\t\"Statement\": \n[\n\t\t{ \"Effect\": \"Allow\", \n\t\t\"Action\": [\"s3:ListBucket\",\"s3:GetBucketLocation\",\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\"],\n\t\t\"Resource\": [\"arn:aws:s3:::$1/*\"]\n\t\t}\n\t]\n}" > "/kloudust/temp/$4.json"
    mcli admin policy create kdadmin "$4" "/kloudust/temp/$4.json"
    if [ $? -eq 1 ]; then
        echo "Failed to create policies"
        exit 1
    fi
    mcli admin policy attach kdadmin "$4" --user "$2"
    if [ $? -eq 1 ]; then
        echo "Failed to attach policies"
        exit 1
    fi

}

if mcli --version &>/dev/null; then
    echo "mcli is already installed."
else
    echo "mcli is not installed. Installing now..."
    sudo wget https://dl.min.io/client/mc/release/linux-amd64/mc -O mc
    sudo mv mc /usr/local/bin/mcli
    sudo chmod +x /usr/local/bin/mcli
    echo "mcli has been successfully installed."
fi

mcli alias list | grep -q kdadmin
if [ $? -eq 1 ]; then
    mcli alias set kdadmin "http://$VM_IP:9000" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
    if [ $? -eq 0 ]; then
        echo "Alias set successfully. Exiting loop."
    fi
    if [ $? -eq 1 ]; then
        echo "Failed to create bucket due to admin alias"
        exit 1
    fi
fi
policy_maker "$BUCKET_NAME" "$USER_ID" "$PASSWORD" "$UNIQUE_BUCKET_NAME"
