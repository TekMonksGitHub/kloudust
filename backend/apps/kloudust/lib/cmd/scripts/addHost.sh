#!/bin/bash

# Params
# {1} The new password for this host for the ID which is logged in to run this script
# {2} The JSON out splitter
# {3} The new SSH port, defaults to 22 if not provided

NEW_PASSWORD="{1}"
JSONOUT_SPLITTER="{2}"
CHANGED_SSH_PORT={3}
NEW_SSH_PORT=${CHANGED_SSH_PORT:-22}

function exitFailed() {
    echo Failed
    exit 1
}

function printConfig() {
    CORESPERCPU=`lscpu | grep Core | tr -s " " | cut -d":" -f2 | xargs`
    SOCKETS=`lscpu | grep Socket | tr -s " " | cut -d":" -f2 | xargs`
    CORES=`lscpu | grep CPU | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORMAKER=`lscpu | grep 'Vendor ID' | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORNAME=`lscpu | grep 'Model name' | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORMODEL=`lscpu | grep 'Model:' | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORSPEED=`lscpu | grep 'CPU max MHz' | tr -s " " | cut -d":" -f2 | xargs`
    PROCESSORARCH=`lscpu | grep 'Architecture:' | tr -s " " | cut -d":" -f2 | xargs`
    if [ "$PROCESSORARCH" == "x86_64" ]; then PROCESSORARCH=amd64; fi
    MEMORY=`free -b | grep "Mem:" | tr -s " " | cut -d" " -f2`
    ROOTDISKTOTAL=`df -B1  / | tail -n+2 | tr -s " " | cut -d" " -f2`
    NETSPEED=$((1073741824*$(networkctl status `networkctl | grep routable | grep ether | head -n1 | xargs | cut -d" " -f2` | grep -i speed | xargs | cut -d" " -f2 | cut -d"G" -f1)))
    OSRELEASE=$(printf "$(cat /etc/issue)" | head -n1 | xargs)

cat <<ENDJSON
$1
{
    "cores": "$CORESPERCPU",
    "memory": "$MEMORY",
    "disk": "$ROOTDISKTOTAL",
    "netspeed": "$NETSPEED",
    "processor": "$PROCESSORMAKER:$PROCESSORNAME:$PROCESSORMODEL:$PROCESSORSPEED",
    "processorarchitecture": "$PROCESSORARCH",
    "sockets": "$SOCKETS",
    "ostype": "$OSRELEASE",
    "sshport": "$NEW_SSH_PORT"
}
ENDJSON
}

printf "Updating the system\n"
if [ -f "`which yum`" ]; then 
    if ! sudo yum -y install epel-release; then exitFailed; fi
    if ! sudo yum -y update; then exitFailed; fi
else 
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y update; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y upgrade; then exitFailed; fi
fi

printf "Installing required software\n"
if [ -f "`which yum`" ]; then 
    if ! sudo yum -y install fail2ban; then exitFailed; fi
    if ! sudo yum -y install sshpass; then exitFailed; fi
    if ! sudo yum -y install qemu-kvm libvirt virt-top bridge-utils libguestfs-tools virt-install tuned genisoimage; then exitFailed; fi
    if ! sudo systemctl stop firewalld; then exitFailed; fi
    if ! sudo systemctl disable firewalld; then exitFailed; fi
    if ! sudo systemctl mask firewalld; then exitFailed; fi
    if ! sudo yum -y install iptables-services; then exitFailed; fi
    if ! sudo yum -y install ufw; then exitFailed; fi
else
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install fail2ban; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install sshpass; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install net-tools iptables-persistent; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install qemu-system-x86 libvirt-daemon-system libvirt-clients bridge-utils virtinst libosinfo-bin guestfs-tools tuned genisoimage; then exitFailed; fi
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install ufw; then exitFailed; fi
    # Remove snapd on Ububtu as it opens outgoing connections to the snap store
    snap list | egrep -v 'base$|snapd$|Notes$' | awk '{print $1}' | xargs -I{} sudo snap remove {} --purge && sudo apt purge -y snapd && rm -rf ~/snap
    apt -y autoremove && apt-mark hold snapd
fi

printf "\n\nSecuring the system against SSH attacks\n"
if ! sudo cat <<EOF > /tmp/kdfail2ban.jail.local; then exitFailed; fi
[DEFAULT]
# Ban hosts for one hour:
bantime = 3600

# Override /etc/fail2ban/jail.d/00-firewalld.conf:
banaction = iptables-multiport

[sshd]
enabled = true
EOF
if ! sudo mv /tmp/kdfail2ban.jail.local /etc/fail2ban/jail.local; then exitFailed; fi
if ! sudo chown root:root /etc/fail2ban/jail.local; then exitFailed; fi
if ! sudo systemctl enable --now fail2ban; then exitFailed; fi


printf "\n\nEnabling hypervisor\n"
if ! sudo systemctl enable --now libvirtd; then exitFailed; fi
if ! sudo lsmod | grep -i kvm; then exitFailed; fi
if ! sudo systemctl enable --now tuned; then exitFailed; fi
if ! tuned-adm profile virtual-host; then exitFailed; fi


printf "\n\nEnabling virtual networking\n"
if [ -f "`which yum`" ]; then 
    if ! sudo yum -y install https://repos.fedorapeople.org/repos/openstack/openstack-antelope/rdo-release-antelope-1.el9s.noarch.rpm openvswitch; then exitFailed; fi
    if ! sudo systemctl enable --now openvswitch; then exitFailed; fi
else
    if ! yes | sudo DEBIAN_FRONTEND=noninteractive apt -qq -y install openvswitch-switch openvswitch-common  openvswitch-switch-dpdk; then exitFailed; fi
    if ! sudo systemctl enable --now openvswitch-switch; then exitFailed; fi
fi

printf "\n\nCreating Kloudust Structures\n"
if ! sudo mkdir -p /kloudust/catalog/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/drivers/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/disks/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/metadata/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/snapshots/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/temp/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/recyclebin/; then exitFailed; fi
if ! sudo mkdir -p /kloudust/system/; then exitFailed; fi

printf "\n\nDownloading additional drivers\n"
if [ "`cat /kloudust/drivers/virtio-win.version`" != "virtio-win-0.1.240.iso" ]; then
    if ! sudo bash -c "curl -L https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/archive-virtio/virtio-win-0.1.240-1/virtio-win-0.1.240.iso > /kloudust/drivers/virtio-win.iso"; then exitFailed; fi
    if ! sudo bash -c  'echo "virtio-win-0.1.240.iso" > /kloudust/drivers/virtio-win.version'; then exitFailed; fi
fi;

printf "\n\nGiving permissions to Kloudust folders to KVM"
if [ -f "`which yum`" ]; then 
    if ! sudo chgrp -R qemu /kloudust/; then exitFailed; fi
else 
    if ! sudo chgrp -R libvirt /kloudust/; then exitFailed; fi
fi


printf "\n\nChanging password and SSH ports, Kloudust is taking over the system\n"
if [ -f "`which yum`" ]; then 
    if ! echo '{1}' | passwd --stdin `whoami` > /dev/null; then exitFailed; fi
else
    if ! echo `whoami`':{1}' | sudo chpasswd > /dev/null; then exitFailed; fi
fi
if ! sed -i 's/^#\?[ ]*[Pp]ort[ ]\+[0-9]\+[ ]*$//g' /etc/ssh/sshd_config; then exitFailed; fi
if ! echo "Port $NEW_SSH_PORT" >> /etc/ssh/sshd_config; then exitFailed; fi
if ! touch ~/.hushlogin; then exitFailed; fi

printf "\n\nSetting up the host firewall\n"
if ! ufw --force reset; then exitFailed; fi
if ! ufw default deny incoming; then exitFailed; fi
if ! ufw default allow outgoing; then exitFailed; fi
if ! ufw allow $NEW_SSH_PORT; then exitFailed; fi
if ! systemctl enable ufw; then exitFailed; fi
if ! ufw --force enable; then exitFailed; fi
if ! systemctl restart ssh; then exitFailed; fi

printf "\n\nSystem initialization finished successfully, reboot needed\n"
printConfig $JSONOUT_SPLITTER
exit 0
