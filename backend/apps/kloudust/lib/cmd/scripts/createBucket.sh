VM_NAME="{1}"
MINIO_ROOT_USER="{2}"
MINIO_ROOT_PASSWORD="{3}"
BUCKET_NAME="{4}"
UNIQUE_BUCKET_NAME="{5}"
USER_ID="{6}"
BUCKET_SIZE="{7}"
PASSWORD="{8}"

VM_IP=$(virsh net-dhcp-leases default | grep "$VM_NAME" | awk '{print $5}' | cut -d '/' -f 1);

function policy_maker(){
    mcli mb "kdadmin/$1"> /dev/null 2>&1
    if [ $? -eq 1 ]; then 
        echo "Failed to create bucket : $BUCKET_NAME" 
        exit 1
    fi  
    echo "Bucket $BUCKET_NAME created successfully"
    mcli quota set "kdadmin/$BUCKET_NAME" --size "$BUCKET_SIZE"Gi
    if [ $? -eq 1 ]; then
        echo "failed to set quota"
        exit 1
    fi
    mcli admin user ls kdadmin --json | grep -q "$USER_ID"
    if [ $? -eq 1 ]; then
        mcli admin user add kdadmin "$3" "$4"
    fi
    printf "{\n\t\"Version\": \"2012-10-17\",\n\t\"Statement\": \n[\n\t\t{ \"Effect\": \"Allow\", \n\t\t\"Action\": [\"s3:ListBucket\",\"s3:GetBucketLocation\",\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\"],\n\t\t\"Resource\": [\"arn:aws:s3:::$1/*\"]\n\t\t}\n\t]\n}" > "/kloudust/temp/$2.json"
    mcli admin policy create kdadmin "$2" "/kloudust/temp/$2.json"
    if [ $? -eq 1 ]; then
        echo "Failed to create policies"
        exit 1
    fi
    mcli admin policy attach kdadmin "$2" --user "$3"
    if [ $? -eq 1 ]; then
        echo "Failed to attach policies"
        exit 1
    fi

}

mcli alias list | grep -q kdadmin
if [ $? -eq 1 ]; then
    for i in {1..5}; do
        sleep 5  
        mcli alias set kdadmin "http://$VM_IP:9000" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
        if [ $? -eq 0 ]; then
            echo "Alias set successfully. Exiting loop."
            break 
        fi
    done
    if [ $? -eq 1 ]; then
        echo "Failed to create bucket due to admin alias"
        exit 1
    fi
fi
policy_maker "$BUCKET_NAME" "$UNIQUE_BUCKET_NAME" "$USER_ID" "$PASSWORD"
