BUCKET_NAME="{1}"
USER_ID="{2}"
POLICY_NAME="{3}"
kdadmin=$(mcli alias list | grep kdadmin);

if mcli alias list | grep -q kdadmin; then
    if mcli ls kdadmin | grep -q $BUCKET_NAME; then
        mcli rb "kdadmin/$BUCKET_NAME" --force
        mcli admin policy detach kdadmin "$POLICY_NAME" --user "$USER_ID"
        mcli admin policy remove kdadmin "$POLICY_NAME"
    else
        echo Error! bucket not found.
        echo Failed
        exit 1
    fi
else
    echo Failed
    exit 1
fi