#!/bin/bash

VM_NAME="{1}"
CLONE_VM_NAME="{2}"
NEW_IP="{3}"

function exitFailed() {
    echo "Failed to clone VM $VM_NAME"
    startOriginalVmOnFailure
    echo Failed
    exit 1
}

function startOriginalVmOnFailure() {
    echo "Starting the Original VM $VM_NAME on clone failure"
    STATE=$(virsh domstate "$VM_NAME")
    if [[ "$STATE" == "running" ]]; then
        echo "Original VM $VM_NAME is already running"
        return
    fi
    if [[ "$STATE" == "shut off" ]]; then
        echo "Starting the Original VM $VM_NAME ........"
        virsh start "$VM_NAME"
        echo "Original VM $VM_NAME started successfully"
        return
    fi
}

echo Shutting down "$VM_NAME"
virsh shutdown "$VM_NAME"

for i in {1..30}; do
    sleep 2
    STATE=$(virsh domstate "$VM_NAME")
    echo "Current state: $STATE"
    if [[ "$STATE" == "shut off" ]]; then
        break
    fi
    if [[ $i -eq 30 ]]; then
        echo "Timeout: VM did not shut down in time."
        exit 1
    fi
done

printf "Cloning VM "$VM_NAME" to "$CLONE_VM_NAME"\n"
if ! virt-clone --original "$VM_NAME" --auto-clone --name "$CLONE_VM_NAME"; then exitFailed; fi


# ✨ Update IP in cloned VM before starting it
# NEW_IP="10.1.1.4"
# virt-edit -d "$CLONE_VM_NAME" /etc/netplan/50-cloud-init.yaml <<EOF
# :g/addresses:/+1s/[0-9.]\{7,\}/$NEW_IP/
# :wq
# EOF

echo "Modifying IP address of $CLONE_VM_NAME"
TMPDIR=$(mktemp -d)
if ! virt-copy-out -d "$CLONE_VM_NAME" /etc/netplan/50-cloud-init.yaml "$TMPDIR"; then exitFailed; fi
sed -i "s/[0-9]\{1,3\}\(\.[0-9]\{1,3\}\)\{3\}\/24/$NEW_IP\/24/" "$TMPDIR/50-cloud-init.yaml"
if ! virt-copy-in -d "$CLONE_VM_NAME" "$TMPDIR/50-cloud-init.yaml" /etc/netplan/; then
    rm -rf "$TMPDIR"
    exitFailed
fi
rm -rf "$TMPDIR"
echo "IP address updated to $NEW_IP"

printf "\n\nGenerating metadata\n"
cat <<EOF > "/kloudust/metadata/${CLONE_VM_NAME}.metadata"
NAME="$CLONE_VM_NAME"
EOF
cat "/kloudust/metadata/${VM_NAME}.metadata" | grep -v NAME >> "/kloudust/metadata/${CLONE_VM_NAME}.metadata"
cat "/kloudust/vm_vlans/${VM_NAME}.vlan" | grep -v NAME >> "/kloudust/vm_vlans/${CLONE_VM_NAME}.vlan"

if ! virsh dumpxml "$CLONE_VM_NAME" > "/kloudust/metadata/${CLONE_VM_NAME}.xml"; then exitFailed; fi

printf "Enabling autostart"
if ! virsh autostart "$CLONE_VM_NAME"; then exitFailed; fi

printf "start VMs"
if ! virsh start "$CLONE_VM_NAME"; then exitFailed; fi
if ! virsh start "$VM_NAME"; then exitFailed; fi

printf "\n\nClone successful\n"
exit 0
