#!/bin/sh

function exitFailed() {
    echo Failed
    exit 1
}

printf "Creating Windows 10 VDI\n"
if ! virt-install --name {1} \
    --metadata title="{2}" \
    --os-variant win10 --vcpus {3} --ram {4} \
    --graphics vnc,listen=0.0.0.0 --noautoconsole \
    --rng /dev/urandom \
    --network bridge=virbr0 \
    --controller type=scsi,model=virtio-scsi \
    --disk path=/kloudust/disks/{1}.qcow2,size={5},format=qcow2 \
    --disk /kloudust/drivers/virtio-win_amd64.vfd,device=floppy \
    --cdrom /kloudust/catalog/{6}; then exitFailed; fi

printf "\n\nConnect via VNC to one of the following\n"
PORT=`virsh vncdisplay {1} | cut -c 2-`;echo `ip route get 8.8.8.8 | head -1 | cut -d' ' -f7`:`expr 5900 + $PORT`
echo `hostname`:`expr 5900 + $PORT`

printf "\n\nVM created successfully\n"
exit 0