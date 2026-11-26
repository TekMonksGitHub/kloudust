/**
 * Automation to manage Kubernetes (k3s) clusters: create, add workers, remove workers, delete.
 * Every node's extrainfo holds {k3s: {cluster, role, token, image, size, adminid}}, token being the k3s agent token.
 * (C) 2026 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 *
 * K3S_MIRROR = "" installs online from get.k3s.io; K3S_VERSION = "" then means the latest stable release.
 * K3S_MIRROR = "http://<ip>:<port>" installs offline from that mirror and needs an exact K3S_VERSION.
 * Mirror layout: install.sh, <version>/{k3s, sha256sum-amd64.txt, k3s-airgap-images-amd64.tar.zst},
 * rpm/el<major>/{container-selinux.rpm, k3s-selinux.rpm}.
 * RHEL-family images: online this is not an issue, install.sh fetches the matching SELinux RPMs itself.
 * With a mirror the RPMs must match the image's EL version - container-selinux needs a selinux-policy
 * no newer than the image has (e.g. the el9_6 build for a RHEL 9.6 image), otherwise the node stops.
 */

const SIZES = {vsmall: [1, 2048, 20], small: [2, 4096, 40], medium: [4, 8192, 80], large: [8, 16384, 160]};
const PASSWORD_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+=@-]{7,}$/, NAME_PATTERN = /^[a-z0-9]{1,10}$/, ADMIN_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const MASTER_IP = "10.100.0.10", K3S_VERSION = "", K3S_MIRROR = "", MAX_WORKERS = 10, SHUTDOWN_WAIT_MS = 45000;
const WAIT_FOR_NODE_IP = "until IFACE=$(ip -o -4 addr show | awk -v ip=\"$NODE_IP/\" 'index($4, ip) == 1 {print $2}'); [ -n \"$IFACE\" ]; do sleep 5; done";
const KUBELET_CONF_DIR = "/var/lib/rancher/k3s/agent/etc/kubelet.conf.d";
const CLEANUP_SCRIPT = "k3s kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name} {.status.conditions[?(@.type==\"Ready\")].status} " +
    "{.status.conditions[?(@.type==\"Ready\")].lastTransitionTime}{\"\\n\"}{end}' | while read -r NODE STATUS SINCE; do " +
    "if [ \"$STATUS\" = Unknown ] && [ $(( $(date +%s) - $(date -d \"$SINCE\" +%s) )) -gt 600 ]; then k3s kubectl delete node \"$NODE\"; fi; done";
const REJOIN_SCRIPT = "KC=/var/lib/rancher/k3s/agent/kubelet.kubeconfig\n" +
    "NODE=$(k3s kubectl --kubeconfig $KC auth whoami -o jsonpath='{.status.userInfo.username}') || exit 0\n" +
    "if k3s kubectl --kubeconfig $KC get node \"${NODE#system:node:}\" 2>&1 | grep -q NotFound; then systemctl restart k3s-agent; fi";

const random = (bytes, alphabet) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => alphabet[b % alphabet.length]).join("");
const infoOf = vm => {try {return JSON.parse(vm.extrainfo)?.k3s || {};} catch {return {};}};
const names = name => ({vnet: "k8s" + name, master: "k8s" + name + "m1", ruleset: "k8s" + name + "fw", worker: i => "k8s" + name + "w" + i});
const notify = (name, text, isError) => monkshu_env.apps[APP_CONSTANTS.APP_NAME].cmdmanager.addAlert(Date.now(), "Kubernetes cluster " + name + ": " + text, isError);

async function kd(kdcmd, ...args) {
    const result = await kdcmd(args.map(arg => JSON.stringify(String(arg))).join(" "));
    if (!result?.result) throw new Error(args[0] + " " + args[1] + " failed, stopping.");
    return result;
}

function newPassword(name, adminid) {
    const password = random(16, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789");
    notify(name, "generated admin password for user " + adminid + " on the new nodes: " + password);
    return password;
}

function systemdTimer(name, script) {
    return ["cat > /usr/local/bin/" + name + " <<'EOF'\n#!/bin/bash\n" + script + "\nEOF",
        "chmod 755 /usr/local/bin/" + name,
        "printf '[Service]\\nType=oneshot\\nExecStart=/usr/local/bin/" + name + "\\n' > /etc/systemd/system/" + name + ".service",
        "printf '[Timer]\\nOnBootSec=5min\\nOnUnitActiveSec=2min\\n\\n[Install]\\nWantedBy=timers.target\\n' > /etc/systemd/system/" + name + ".timer",
        "systemctl daemon-reload && systemctl enable --now " + name + ".timer"].join("\n");
}

function kNodeScript(node, info, serverToken) {
    const role = node.isMaster ? "server" : "agent", service = node.isMaster ? "k3s" : "k3s-agent";
    const install = !K3S_MIRROR ? "curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=" + K3S_VERSION + " INSTALL_K3S_BIN_DIR=/usr/bin sh -s - " + role : [
        "mkdir -p /var/lib/rancher/k3s/agent/images",
        "curl -sfL -o /var/lib/rancher/k3s/agent/images/k3s-airgap-images-amd64.tar.zst " + K3S_MIRROR + "/" + K3S_VERSION + "/k3s-airgap-images-amd64.tar.zst",
        "if [ -d /usr/share/selinux ]; then . /etc/os-release; EL=el${VERSION_ID%%.*}; " +
            "{ curl -sfL -o /tmp/container-selinux.rpm " + K3S_MIRROR + "/rpm/$EL/container-selinux.rpm && curl -sfL -o /tmp/k3s-selinux.rpm " + K3S_MIRROR + "/rpm/$EL/k3s-selinux.rpm && " +
            "dnf install -y --disablerepo='*' /tmp/container-selinux.rpm /tmp/k3s-selinux.rpm; } || " +
            "{ echo \"kd-k3s: SELinux RPMs from " + K3S_MIRROR + "/rpm/$EL failed to download or install, check they match this image\" >&2; exit 1; }; fi",
        "curl -sfL " + K3S_MIRROR + "/install.sh | INSTALL_K3S_VERSION=" + K3S_VERSION + " INSTALL_K3S_ARTIFACT_URL=" + K3S_MIRROR +
            " INSTALL_K3S_BIN_DIR=/usr/bin INSTALL_K3S_SKIP_SELINUX_RPM=true INSTALL_K3S_SKIP_START=true sh -s - " + role,
        "[ -d /usr/share/selinux ] && chcon -u system_u -r object_r -t container_runtime_exec_t /usr/bin/k3s",
        "systemctl start " + service].join("\n");
    const lines = ["#!/bin/bash", "NODE_IP=" + node.ip, WAIT_FOR_NODE_IP, "mkdir -p /etc/rancher/k3s " + KUBELET_CONF_DIR,
        "printf 'apiVersion: kubelet.config.k8s.io/v1beta1\\nkind: KubeletConfiguration\\nshutdownGracePeriod: 30s\\nshutdownGracePeriodCriticalPods: 10s\\n' > " + KUBELET_CONF_DIR + "/10-kd-shutdown.conf"];
    if (node.isMaster) lines.push(
        "for i in $(seq 180); do PUBLIC_IP=$(ip -o -4 addr show scope global | grep -v dynamic | awk '{split($4, a, \"/\"); print a[1]}' | grep -vxF \"$NODE_IP\" | head -1); [ -n \"$PUBLIC_IP\" ] && break; sleep 5; done",
        "printf 'token: %s\\nagent-token: %s\\nnode-ip: %s\\nflannel-iface: %s\\n' \"" + serverToken + "\" \"" + info.token + "\" \"$NODE_IP\" \"$IFACE\" > /etc/rancher/k3s/config.yaml",
        "[ -n \"$PUBLIC_IP\" ] && printf 'tls-san: [%s]\\nnode-external-ip: %s\\n' \"$PUBLIC_IP\" \"$PUBLIC_IP\" >> /etc/rancher/k3s/config.yaml",
        install,
        "until [ -f /etc/rancher/k3s/k3s.yaml ]; do sleep 5; done",
        "sed \"s/127.0.0.1/${PUBLIC_IP:-$NODE_IP}/\" /etc/rancher/k3s/k3s.yaml > /home/" + info.adminid + "/kubeconfig.yaml",
        "chown " + info.adminid + ": /home/" + info.adminid + "/kubeconfig.yaml && chmod 600 /home/" + info.adminid + "/kubeconfig.yaml",
        systemdTimer("kd-k3s-cleanup", CLEANUP_SCRIPT));
    else lines.push(
        "printf 'server: https://%s:6443\\ntoken: %s\\nnode-ip: %s\\nflannel-iface: %s\\nwith-node-id: true\\n' \"" + MASTER_IP + "\" \"" + info.token + "\" \"$NODE_IP\" \"$IFACE\" > /etc/rancher/k3s/config.yaml",
        install,
        systemdTimer("kd-k3s-rejoin", REJOIN_SCRIPT));
    lines.push("systemctl is-active --quiet " + service + " && rm -f \"$0\"");
    return lines.join("\n") + "\n";
}

function cloudInit(node, info, adminpass, serverToken) {
    return "{system_info: {default_user: {name: '" + info.adminid + "', home: /home/" + info.adminid + ", sudo: 'ALL=(ALL) NOPASSWD:ALL'}}, " +
        "password: '" + adminpass + "', chpasswd: {expire: false}, hostname: " + node.vm + ", fqdn: " + node.vm + ", ssh_pwauth: true, packages: [qemu-guest-agent], " +
        "write_files: [{path: /root/kd-k3s.sh, permissions: '0700', encoding: b64, content: " + btoa(kNodeScript(node, info, serverToken)) + "}], " +
        "runcmd: [[bash, -lc, 'systemctl start qemu-guest-agent'], [bash, /root/kd-k3s.sh]]}";
}

async function assignNodeIP(run, node, vnet) {
    for (let attempt = 1; attempt < 5; attempt++) try {return await run("assignVnetIP", node.vm, node.ip, vnet);} catch {}
    return run("assignVnetIP", node.vm, node.ip, vnet);
}

async function addNodes(run, name, indices, info, adminpass, serverToken) {
    const {vnet, master, worker} = names(name), spec = SIZES[info.size];
    const nodes = indices.map(i => i ? {vm: worker(i), ip: "10.100.0." + (20 + i)} : {vm: master, ip: MASTER_IP, isMaster: true});
    for (const node of nodes) await run("createVM", node.vm, "Kubernetes " + name + (node.isMaster ? " master" : " worker"), spec[0], spec[1], spec[2], vnet, info.image,
        cloudInit(node, info, adminpass, serverToken), "false", "", "", "", "", "", "", "", JSON.stringify({k3s: {...info, role: node.isMaster ? "master" : "worker"}}));
    for (const node of nodes) await assignNodeIP(run, node, vnet);
}

async function createCluster({name, count, nodeSize, image, adminid, adminpass, nodes, run}) {
    const {vnet, master, ruleset} = names(name);
    if (nodes.length) throw new Error("a cluster with this name exists already. Nothing was created.");
    if (!ADMIN_PATTERN.test(adminid)) throw new Error("the admin user must start with a letter and use only a-z, 0-9, _ and -. Nothing was created.");
    if (count < 1 || count > MAX_WORKERS) throw new Error("the number of workers must be 1 to " + MAX_WORKERS + ". Nothing was created.");
    const rules = [
        {direction: "in", allow: false, protocol: "udp", port: "8472", ip: "*"},
        {direction: "in", allow: false, protocol: "tcp", port: "10250", ip: "*"},
        {direction: "in", allow: false, protocol: "tcp", port: "2379-2380", ip: "*"}
    ];

    const info = {cluster: name, token: random(32, "0123456789abcdef"), image, size: SIZES[nodeSize] ? nodeSize : "vsmall", adminid};
    await run("createVnet", vnet, "Kubernetes cluster " + name);
    await addNodes(run, name, Array.from({length: count + 1}, (_, i) => i), info, adminpass || newPassword(name, adminid), random(32, "0123456789abcdef"));
    await run("assignIPToVM", master, "");
    await run("createFirewallRuleset", ruleset, "Kubernetes " + name + " internal ports", JSON.stringify(rules));
    await run("applyFirewallRuleset", master, ruleset);
    const publicIP = ((await run("listAssignedVMIPs", master).catch(() => ({}))).ips || "").split(",")[0].trim();
    notify(name, "installing (about 5 to 10 minutes). API: https://" + publicIP + ":6443. Get the kubeconfig with: scp " + adminid + "@" + publicIP + ":kubeconfig.yaml .");
}

async function addWorkers({name, count, adminpass, info, workers, run}) {
    const {worker} = names(name);
    if (count < 1 || workers.length + count > MAX_WORKERS) throw new Error("it has " + workers.length + " workers and can have at most " + MAX_WORKERS + ". Nothing was changed.");
    const indices = []; for (let i = 1; indices.length < count; i++) if (!workers.includes(i)) indices.push(i);
    await addNodes(run, name, indices, info, adminpass || newPassword(name, info.adminid));
    notify(name, "added " + indices.map(worker).join(", ") + ". They join the cluster in about 5 minutes.");
}

async function removeWorkers({name, count, workers, run}) {
    const {worker} = names(name);
    if (count < 1 || count > workers.length) throw new Error("can't remove " + count + " of its " + workers.length + " workers. Nothing was changed.");
    const doomed = workers.slice(-count).map(worker);
    for (const vm of doomed) await run("powerOpVM", vm, "stop").catch(() => {});
    notify(name, "stopping " + doomed.join(", ") + ", they will be deleted in about a minute.");
    await new Promise(resolve => setTimeout(resolve, SHUTDOWN_WAIT_MS));
    for (const vm of doomed) await run("deleteVM", vm);
    notify(name, "removed " + doomed.join(", ") + ". They drop out of kubectl get nodes within about 10 minutes.");
}

async function deleteCluster({name, confirm, workers, run}) {
    const {vnet, master, ruleset, worker} = names(name);
    if (confirm.trim().toLowerCase() != name) throw new Error("type the cluster name to confirm the deletion. Nothing was deleted.");
    try {for (const vm of [...workers.map(worker), master]) await run("deleteVM", vm);}
    catch (err) {throw new Error(err.message + " Run Delete again to finish.");}
    try {await run("deleteFirewallRuleset", ruleset); await run("deleteVnet", vnet);}
    catch (err) {throw new Error(err.message + " Delete the rest by hand.");}
    notify(name, "deleted.");
}

async function exec(params, kdcmd) {
    const [action, newName, pickedName, countRaw, nodeSize, image, adminidRaw, adminpass, confirm] = params;
    const name = ((action == "create" ? newName : pickedName) || "").trim().toLowerCase();
    const run = (...args) => kd(kdcmd, ...args), {worker} = names(name);
    const actions = {create: createCluster, addworkers: addWorkers, removeworkers: removeWorkers, delete: deleteCluster};

    try {
        if (K3S_MIRROR && !K3S_VERSION) throw new Error("a k3s mirror is set, so K3S_VERSION must be an exact version.");
        if (!NAME_PATTERN.test(name)) throw new Error("the cluster name must be 1 to 10 letters or digits. Nothing was changed.");
        if (adminpass && !PASSWORD_PATTERN.test(adminpass)) throw new Error("the admin password must be 8+ characters of letters, digits and . _ + = @ - only. Nothing was changed.");

        const vms = (await run("listVMsForOrgOrProject", $$.libsession.get(APP_CONSTANTS.USERORG), $$.libsession.get(APP_CONSTANTS.ACTIVE_PROJECT), "")).vms || [];
        const nodes = vms.filter(vm => infoOf(vm).cluster == name);
        const info = infoOf(nodes.find(vm => infoOf(vm).role == "master") || {});
        const workers = nodes.filter(vm => infoOf(vm).role == "worker").map(vm => parseInt(vm.name_raw.slice(worker("").length))).sort((a, b) => a - b);
        if (action != "create" && !info.token) throw new Error("not found, or created before cluster management existed. Nothing was changed.");
        if (!actions[action]) throw new Error("unknown action " + action + ".");

        await actions[action]({name, run, nodes, info, workers, count: parseInt(countRaw) || 0, nodeSize, image, adminid: (adminidRaw || "").trim(), adminpass, confirm: confirm || ""});
    } catch (err) {notify(name, err.message, true);}
}

export const automations_managekubernetescluster = {exec};
