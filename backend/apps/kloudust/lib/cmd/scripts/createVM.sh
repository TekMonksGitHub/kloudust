#!/bin/bash

# Params
# {1} VM Name - no spaces
# {2} VM Description - can have spaces
# {3} VCPUS
# {4} Memory in MB
# {5} Disk Size in GB
# {6} Install disk name
# {7} Install disk download URI, CURL will be used
# {8} OS Variant as per virt-install --os-variant list
# {9} true means this is a pre-installed cloud image, false means no it is an ISO
# {10} Cloudinit YAML data or undefined if not available
# {11} Org which owns this VM
# {12} Project which owns this VM
# {13} Force overwrite, if VM with same name exists overwrite it
# {14} Max cores
# {15} Max memory
# {16} Additional virt-install params
# {17} No guest agent - By default QEMU Guest Agent is enabled, if this is true it is disabled
# {18} Network name - By default none is used, can be set to default if default networking is available
# {19} Restart wait - time to wait for the first restart to stabalize

NAME="{1}"
DESCRIPTION="{2}"
VCPUS={3}
MEMORY={4}
DISK_SIZE={5}
INSTALL_DISK="{6}"
INSTALL_URI="{7}"
OS_VARIANT={8}
CLOUD_IMAGE={9}
CLOUDINIT_USERDATA="{10}"
ORG="{11}"
ORG="${ORG// /_}"
PROJECT="{12}"
FORCE_OVERWRITE={13}
MAX_VCPUS={14}
MAX_MEMORY={15}
VIRT_INSTALL_PARAMS="{16}"
NO_GUEST_AGENT={17}
KVM_NETWORK_NAME={18}
SHUTDOWN_WAIT={19}
SHUTDOWN_WAIT="${SHUTDOWN_WAIT:-20}"    # Default it to 90 seconds if not provided

function exitFailed() {
    echo Failed
    exit 1
}

function waitProcessKilled() {
    PID=$1
    TIME_TO_WAIT=$2

    WAITED_SO_FAR=0
    while [ $WAITED_SO_FAR -lt $TIME_TO_WAIT ]; do
        ps --pid $PID
        if [ "$?" == "1" ]; then return 0; 
        else 
            sleep 5
            WAITED_SO_FAR=$(($WAITED_SO_FAR+5))
        fi
    done
    return 1
}

function shutdownVM() {
    VMNAME=$1
    VMPID=`ps ax | grep $VMNAME | grep kvm | tr -s " " | xargs  | cut -d" " -f1`
    if ! virsh shutdown $VMNAME; then exitFailed; fi
    waitProcessKilled $VMPID $SHUTDOWN_WAIT
    if [ "$?" == "1" ]; then  
        echo VM graceful shutdown timed out for $VMNAME after waiting $SHUTDOWN_WAIT seconds, destroying it instead. 
        if ! virsh destroy $VMNAME; then 
            echo VM destroy failed as well for $VMNAME.
            return 1
        else
            echo VM $VMNAME was shutdown via forced destroy.
        fi
    else
        echo Warning!! VM $VMNAME was shutdown gracefully.
    fi
    return 0
}

SPACE_PATTERN=" |'"
if [[ $NAME =~ $SPACE_PATTERN ]]; then 
    printf "VM name $NAME can't have spaces.\n"
    exitFailed
fi

if virsh list --all | grep "$NAME"; then
    if [ "FORCE_OVERWRITE" == "true" ]; then
        printf "WARNING!! Deleting existing VM, force overwrite was true.\n"
        if ! virsh destroy $NAME; then exitFailed; fi
        if ! virsh undefine $NAME --nvram; then exitFailed; fi
    else
        printf "VM already exists. Use a different name.\n"
        exitFailed
    fi
fi

if [ ! -f /kloudust/catalog/$INSTALL_DISK ]; then
    printf "VM install disk not found cached locally. Downloading first.\n"
    if ! curl $INSTALL_URI > /kloudust/catalog/$INSTALL_DISK; then exitFailed; fi
fi

printf "Creating VM $NAME\n"

DISK="path=/kloudust/disks/$NAME.qcow2,discard=unmap,format=qcow2"
BOOTCMD="--boot hd"
CLOUD_INIT="--cloud-init user-data=/kloudust/temp/ci_$NAME.yaml"
if [ "$CLOUD_IMAGE" == "true" ]; then # this is a cloud image file in QCow2 format, convert and load, else it is a CD-ROM ISO file
    if ! qemu-img convert -f qcow2 -O qcow2 /kloudust/catalog/$INSTALL_DISK /kloudust/disks/$NAME.qcow2; then exitFailed; fi
    if ! qemu-img resize /kloudust/disks/$NAME.qcow2 "$DISK_SIZE"G; then exitFailed; fi
    if [ "$CLOUDINIT_USERDATA" != "undefined" ] && [ -n "$CLOUDINIT_USERDATA" ]; then # check if a cloud init is provided 
        if ! printf "#cloud-config\n\n$CLOUDINIT_USERDATA" > /kloudust/temp/ci_$NAME.yaml; then exitFailed; fi
    else
        CLOUD_INIT=""
        echo !WARNING! $NAME is a cloud image but no cloud init was provided. Image may not boot or work properly.
    fi
else
    echo !WARNING! $NAME is being initialized using a non-cloud ready image. Manual install will be required.
    DISK="$DISK",size=$DISK_SIZE
    BOOTCMD="--cdrom /kloudust/catalog/$INSTALL_DISK"
    CLOUD_INIT=""
    ISO_VNC_ARGS="--graphics vnc,listen=0.0.0.0"
fi


if [[ "$OS_VARIANT" = win* ]]; then 
    if [ "$CLOUD_IMAGE" != "true" ]; then
        WIN_DISK_ARGS="--disk /kloudust/drivers/virtio-win.iso,device=cdrom"
    fi
    WIN_KVM_ARGS="--features smm.state=on,kvm_hidden=on,hyperv_relaxed=on,hyperv_vapic=on,hyperv_spinlocks=on,hyperv_spinlocks_retries=8191 --clock hypervclock_present=yes"
    
    if [ "$CLOUD_IMAGE" == "true" ] && [ "$CLOUDINIT_USERDATA" != "undefined" ] && [ -n "$CLOUDINIT_USERDATA" ]; then
        RANDOMSTR=`echo $RANDOM | md5sum | cut -d" " -f1`
        DISKIMAGEPATH=/kloudust/temp/"$ORG"_"$PROJECT"_"$RANDOMSTR"_cidata
        DISKPATH="$DISKIMAGEPATH"/cidata.iso

        mkdir -p $DISKIMAGEPATH
        if ! printf "#cloud-config\n\n$CLOUDINIT_USERDATA" > "$DISKIMAGEPATH"/user-data; then exitFailed; fi
        if ! printf "instance-id: windows-$ORG-$PROJECT-$RANDOMSTR\n" > "$DISKIMAGEPATH"/meta-data; then exitFailed; fi
        genisoimage -output $DISKPATH -V cidata -r -J "$DISKIMAGEPATH"/user-data "$DISKIMAGEPATH"/meta-data
        CLOUD_INIT="--disk path=$DISKPATH,device=cdrom --install no_install=yes"
    else
        echo !WARNING! $NAME is being initialized using a non-cloud ready image. Manual install will be required.
        CLOUD_INIT=""
    fi
else
    WIN_DISK_ARGS=""
    WIN_KVM_ARGS=""
fi;

QEMU_GUEST_AGENT="--channel unix,target_type=virtio,name=org.qemu.guest_agent.0"
if [[ "$NO_GUEST_AGENT" = true ]]; then QEMU_GUEST_AGENT=""; fi

BASE64_METADATA=`echo "iscloud=$CLOUD_IMAGE>>>installuri=$INSTALL_URI>>>installdisk=/kloudust/catalog/$INSTALL_DISK>>>cloudinit=\"$CLOUDINIT_USERDATA\"" | base64 -w0`
if [ -z "$BASE64_METADATA" ]; then
	echo BASE64 metadata generation failed. >&2
	exitFailed
fi

NETWORK_ARGS="--network network=$KVM_NETWORK_NAME"
if [ "$KVM_NETWORK_NAME" == "none" ]; then
    NETWORK_ARGS="--network none"
fi

if ! virt-install --name $NAME --metadata name=$NAME --metadata title="$DESCRIPTION" \
    --metadata description=$BASE64_METADATA \
    --vcpus $VCPUS,maxvcpus=$MAX_VCPUS \
    --memory currentMemory=$MEMORY,maxmemory=$MAX_MEMORY \
    --disk $DISK \
    --os-variant $OS_VARIANT \
    --controller type=scsi,model=virtio-scsi \
    --noautoconsole \
    --virt-type kvm \
    --video model=qxl,heads=1 \
    $NETWORK_ARGS \
    $ISO_VNC_ARGS \
    $VIRT_INSTALL_PARAMS \
    $QEMU_GUEST_AGENT \
    $WIN_KVM_ARGS \
    $WIN_DISK_ARGS \
    $BOOTCMD $CLOUD_INIT; then exitFailed; fi

printf "\n\nEnabling autostart\n"
if ! virsh autostart $NAME; then exitFailed; fi

printf "\n\nGenerating metadata\n"
cat <<EOF > /kloudust/metadata/$NAME.metadata
INSTALL="virt-install --name $NAME --metadata name=$NAME --metadata title=\"$DESCRIPTION\" \
    --metadata description=$BASE64_METADATA \
    --vcpus $VCPUS,maxvcpus=$MAX_VCPUS \
    --memory currentMemory=$MEMORY,maxmemory=$MAX_MEMORY \
    --disk $DISK \
    --os-variant $OS_VARIANT \
    --controller type=scsi,model=virtio-scsi \
    --noautoconsole \
    --virt-type kvm \
    --video model=qxl,heads=1 \
    $NETWORK_ARGS \
    $ISO_VNC_ARGS \
    $VIRT_INSTALL_PARAMS \
    $QEMU_GUEST_AGENT \
    $WIN_KVM_ARGS \
    $WIN_DISK_ARGS \
    $BOOTCMD $CLOUD_INIT"
NAME="$NAME"
DESCRIPTION="$DESCRIPTION"
VCPUS=$VCPUS
MAX_VCPUS=$MAX_VCPUS
MEMORY=$MEMORY
MAX_MEMORY=$MAX_MEMORY
DISK_SIZE=$DISK_SIZE
INSTALL_DISK="$INSTALL_DISK"
INSTALL_URI="$INSTALL_URI"
OS_VARIANT=$OS_VARIANT
CLOUD_IMAGE=$CLOUD_IMAGE
CLOUDINIT_USERDATA="$CLOUDINIT_USERDATA"
ORG="$ORG"
PROJECT="$PROJECT"
EOF
if ! virsh dumpxml $NAME > /kloudust/metadata/$NAME.xml; then exitFailed; fi

# this seems to stop cloudinit - we can't really do this - reason was that first
# reboot doesn't auto restart VM - need to think a better solution

#printf "Performing an initial restart cycle to stablize"
#if shutdownVM $NAME; then virsh start $NAME; fi

printf "\n\nVM created successfully\n"
exit 0