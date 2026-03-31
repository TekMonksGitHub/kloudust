#!/bin/bash

function exitFailed() {
    echo Failed
    exit 1
}

printf "Cloning VM {1} to {2}\n"
if ! sudo virt-clone --original {1} --auto-clone --name {2}; then exitFailed; fi

printf "\n\nGenerating metadata\n"
sudo bash -c "cat <<EOF > /kloudust/metadata/{2}.metadata
NAME={2}
EOF"
cat /kloudust/metadata/{1}.metadata | grep -v NAME | sudo tee -a /kloudust/metadata/{2}.metadata > /dev/null
if ! sudo virsh dumpxml {2} > /kloudust/metadata/{2}.xml; then exitFailed; fi

printf "Enabling autostart"
if ! sudo virsh autostart {2}; then exitFailed; fi

printf "\n\nClone successful\n"
exit 0
