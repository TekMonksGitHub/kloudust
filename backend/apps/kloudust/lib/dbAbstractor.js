/** 
 * dbAbstractor.js - All DB queries for Kloudust. Role enforcement is
 * embedded here as well via calls to role enforcer.
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const path = require("path");
const kdutils = require(`${KLOUD_CONSTANTS.LIBDIR}/utils.js`);
const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const crypt = require(`${KLOUD_CONSTANTS.MONKSHU_BACKEND_LIBDIR}/crypt.js`);
const monkshubridge = require(`${KLOUD_CONSTANTS.LIBDIR}/monkshubridge.js`);
const jsonxparser = require(`${KLOUD_CONSTANTS.MONKSHU_BACKEND_LIBDIR}/jsonx.js`);
const dbschema = jsonxparser.parseFileSync(`${KLOUD_CONSTANTS.DBDIR}/kd_dbschema.jsonx`);

const KLOUDUST_MAIN_DBFILE = path.resolve(`${KLOUD_CONSTANTS.ROOTDIR}/db/kloudust.db`);

/** Inits the module */
exports.initAsync = async function() { KLOUD_CONSTANTS.env.db = await _initMonkshuGlobalAndGetDBModuleAsync(); }

/** Returns the total number of users in the cloud database */
exports.getUserCount = async _ => {
    const user_count = (await _db().getQuery("select * from users"))?.length||0;
    if (user_count == 0) return user_count; // this is a special case when the Kloud has no users at all
    
    // if we have users already then we must lookup the role permissions
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource)) {_logUnauthorized(); return 0;}
    else return user_count;
}

/**
 * Returns all registered hosts.
 * @return All registered hosts.
 */
exports.getHosts = async _ => {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource_for_project)) {_logUnauthorized(); return false; }

    const query = "select * from hosts";
    const resources = await _db().getQuery(query, []);
    if ((!resources) || (!resources.length)) return null; else return resources;
}

/**
 * Adds the given host to the catalog, if it exists, it will delete and reinsert it. 
 * Hosts are never tied to any project, org or entity and owned by the entire cloud.
 * @param {string} hostname The hostname which is any identifiable name for the host
 * @param {string} hostaddress The host IP or DNS address
 * @param {string} type The host type
 * @param {string} rootid The host's admin user id
 * @param {string} rootpw The host's admin password
 * @param {string} hostkey The hostkey
 * @param {number} port The SSH port for the host
 * @param {number} cores The cores
 * @param {number} memory The memory
 * @param {number} disk The disk
 * @param {number} networkspeed The networkspeed
 * @param {string} processor The processor
 * @param {string} processor The processor architecture eg amd64
 * @param {number} sockets The sockets
 * @return true on success or false otherwise
 */
exports.addHostToDB = async (hostname, hostaddress, type, rootid, rootpw, hostkey, port, cores, memory, disk, networkspeed, 
        processor, processor_architecture, sockets) => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {_logUnauthorized(); return false;}

    const rootpw_encrypted = crypt.encrypt(rootpw);
    const query = "replace into hosts(hostname, hostaddress, type, rootid, rootpw, hostkey, port, cores, memory, disk, networkspeed, processor, processorarchitecture, sockets) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    return await _db().runCmd(query, [hostname, hostaddress, type, rootid, rootpw_encrypted, hostkey, port, cores, memory, 
        disk, networkspeed, processor, processor_architecture, sockets]);
}

/**
 * Deletes the given host from the catalog. Only cloud admin can delete hosts.
 * @param {string} hostname The hostname
 * @return true on success or false otherwise
 */
exports.deleteHostFromDB = async (hostname) => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {_logUnauthorized(); return false; }

    const query = "delete from hosts where hostname = ? collate nocase";
    return await _db().runCmd(query, [hostname]);
}

/**
 * Sets the latest synced timestamp for the host
 * @param {string} hostname The hostname to update the entry for
 * @param {number} timestamp The sync timestamp value to set
 * @returns true on success or false otherwise
 */
exports.updateHostSynctime = async(hostname, timestamp) => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {_logUnauthorized(); return false; }

    const query = "update hosts set synctimestamp = ? where hostname = ? collate nocase";
    return await _db().runCmd(query, [timestamp, hostname]);
}

/**
 * Returns all hosts matching the given processor architecture.
 * @param {string} processor_architecture The processor architecutre, eg amd64
 * @returns The matching hosts or null on error or empty array if nothing found
 */
exports.getHostsMatchingProcessorArchitecture = async(processor_architecture) => {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource)) {_logUnauthorized(); return false; }

    const query = "select * from hosts where processorarchitecture=? collate nocase";
    const hosts = await _db().getQuery(query, [processor_architecture]);
    if (hosts && hosts.length) for (const host of hosts) host.rootpw = crypt.decrypt(host.rootpw);
    return hosts;
}

/**
 * Adds the given host resources to the tracking DB
 * @param {string} name Unique name
 * @param {string} uri Download URL usually
 * @param {string} processor_architecture The processor architecture eg amd64
 * @param {string} description Description 
 * @param {string} extra Extra information 
 * @param {string} type The resource type
 * @returns true on success or false otherwise
 */
exports.addHostResource = async (name, uri, processor_architecture, description, extra, type) => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {_logUnauthorized(); return false; }

    const query = "replace into hostresources(name, uri, processorarchitecture, description, extrainfo, type) values (?,?,?,?,?,?)";
    return await _db().runCmd(query, [name, uri, processor_architecture, description, extra, type]);
}

/**
 * Returns the given host resource for cloud admin
 * @param {string} name The resource name
 * @return host resource object on success or null otherwise
 */
exports.getHostResource = async name => {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource)) {_logUnauthorized(); return false; }
    const query = "select * from hostresources where name=? collate nocase";
    const resources = await _db().getQuery(query, [name]);
    if ((!resources) || (!resources.length)) return null; else return resources[0];
}

/**
 * Returns the given host resource for project
 * @param {string} name The resource name
 * @param {string} type The resource type
 * @return host resource object on success or null otherwise
 */
exports.getHostResourceForProject = async (name, type) => {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource_for_project)) {_logUnauthorized(); return false; }

    const query = type?"select * from hostresources where name=? collate nocase and type = ? collate nocase":
        "select * from hostresources where name=? collate nocase";
    const resources = await _db().getQuery(query, type?[name,type]:[name]);
    if ((!resources) || (!resources.length)) return null; else return resources[0];
}

/**
 * Returns all registered host resources of a given type.
 * @param type The type of resource
 * @return All registered host resources or null on errors.
 */
exports.getHostResources = async type => {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource_for_project)) {_logUnauthorized(); return false; }

    const query = type?"select * from hostresources where type = ? collate nocase":"select * from hostresources";
    const resources = await _db().getQuery(query, type?[type]:[]);
    if ((!resources) || (!resources.length)) return null; else return resources;
}

/**
 * Deletes the given host resource. Only cloud admin can delete hosts.
 * @param {string} name The resource name
 * @return true on success or false otherwise
 */
exports.deleteHostResource = async (name) => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {_logUnauthorized(); return false; }

    const query = "delete from hostresources where name = ? collate nocase";
    return await _db().runCmd(query, [name]);
}

/**
 * Returns the host entry object for the given hostname. Any valid project user
 * is authorized as VMs and other resources need host entry to access the hosting
 * server for them.
 * @param {string} hostname The host name
 * @return {hostname, rootid, rootpw, hostkey} or null
 */
exports.getHostEntry = async hostname => {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource_for_project)) {_logUnauthorized(); return false; }

    const hosts = await _db().getQuery("select * from hosts where hostname = ? collate nocase", hostname);
    if (!hosts || !hosts.length) return null;

    hosts[0].rootpw = crypt.decrypt(hosts[0].rootpw);  // decrypt the password
    return hosts[0];
}

/**
 * Returns the host with the most available resources
 * @return {hostname, cpu, memory} or null
 */
exports.getAvailableHost = async (cpu,ram,arch) => {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource_for_project)) {_logUnauthorized(); return false; }
    const query = `SELECT h.hostname, (h.cores * 8 - IFNULL(SUM(v.cpus), 0)) AS free_cpu, (h.memory * 1.5 - IFNULL(SUM(v.memory) * 1024 * 1024, 0)) AS free_ram FROM hosts h LEFT JOIN vms v ON v.hostname = h.hostname WHERE h.processorarchitecture = ? GROUP BY h.hostname HAVING free_cpu >= ? and free_ram >= ? ORDER BY free_cpu DESC, free_ram DESC LIMIT 1;`;
    const host = await _db().getQuery(query, [arch,cpu,ram]);
    return host;
}

/**
 * Adds the given VM to the catalog.
 * @param {string} name The VM name
 * @param {string} description The VM description
 * @param {string} hostname The hostname
 * @param {string} os The OS
 * @param {integer} cpus The CPU
 * @param {integer} memory The memory
 * @param {string} disks The disks object
 * @param {string} creation_cmd The VM creation command
 * @param {string} name_raw The VM name raw 
 * @param {string} vmtype The VM type
 * @param {string} ip The VM IPs, default is empty
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @return true on success or false otherwise
 */
exports.addOrUpdateVMToDB = async (name, description, hostname, os, cpus, memory, disks, creation_cmd="undefined", 
        name_raw, vmtype, ips='', project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) => {

    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const id = `${org}_${project}_${name}`;
    const query = "replace into vms(id, name, description, hostname, org, projectid, os, cpus, memory, disksjson, creationcmd, name_raw, vmtype, ips) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    return await _db().runCmd(query, [id, name, description, hostname, org, _getProjectID(), os, cpus, memory, JSON.stringify(disks), creation_cmd, name_raw, vmtype, ips]);
}

/**
 * Returns the VM for the current user, org and project given its name. 
 * @param {string} name The VM Name
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @return VM object or null
 */
exports.getVM = async (name, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) => {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const vmid = `${org}_${project}_${name}`, 
        results = await _db().getQuery("select * from vms where id = ? collate nocase", [vmid]);
    if ((!results) || (!results.length)) return null;
    
    const vm = results[0]; try {vm.disks = JSON.parse(vm.disksjson);} catch (err) {
        KLOUD_CONSTANTS.LOGERROR(`Unable to parse disks for VM ${vm.name}`); vm.disks = [];
    };
    return vm;
}

/**
 * Renames the VM for the current user, org and project given its name. The VM's owning org can't be 
 * changed via this command. The renmaed VM belongs to the same org.
 * @param {string} name The VM name
 * @param {string} newname The VM new name
 * @param {string} newname_raw The VM new name raw
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @param {string} newproject The new project, if skipped is set to the original project
 * @return true on success or false otherwise
 */
exports.renameVM = async (name, newname, newname_raw, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org, newproject) => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org); 
        newproject = roleman.getNormalizedProject(newproject||project);

    const vm = await exports.getVM(name, project, org); if (!vm) return false;
    if (!await exports.addOrUpdateVMToDB(newname, vm.description, vm.hostname, vm.os, vm.cpus, vm.memory, 
        JSON.parse(vm.disksjson), vm.creation_cmd, newname_raw, vm.vmtype, vm.ips, newproject, org)) return false;
    return await exports.deleteVM(name, project, org); 
}

/**
 * Deletes the VM for the current user, org and project given its name. Moves the object to the
 * recycle bin as well.
 * @param {string} name The VM Name
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @return true on success or false otherwise
 */
exports.deleteVM = async (name, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const vm = await exports.getVM(name, project, org); if (!vm) return true; // doesn't exist in the DB anyways

    const vmid = `${org}_${project}_${name}`;
    const deletionResult = await _db().runCmd("delete from vms where id = ? collate nocase", [vmid]);
    if (deletionResult) if (!await this.addObjectToRecycleBin(vmid, vm, project, org)) 
        KLOUD_CONSTANTS.LOGWARN(`Unable to add VM ${name} to the recycle bin.`);
    return deletionResult;
}

/**
 * Changes hostname hosting the given VM. Only cloud admins can run this.
 * @param {string} name VM ID (getVM returns this)
 * @param {string} newHostname New hostname
 * @returns true on success or false otherwise
 */
exports.updateVMHost = async (vmid, newHostname) => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {_logUnauthorized(); return false;}

    const updateResult = await _db().runCmd("update vms set hostname = ? where id = ? collate nocase", [newHostname, vmid]);
    return updateResult;
}

/**
 * Returns VMs for the given org and / or current project. All VMs for the current project
 * are returned if hostname is skipped. This is for project admins or project users.
 * @param {array} types The VM types
 * @param {string} org The org, if skipped is auto picked from the environment
 * @param {string} project The project, if skipped is auto picked from the environment if needed
 * @return The list of VMs
 */
exports.listVMsForOrgOrProject = async (types, org=KLOUD_CONSTANTS.env.org, project) => {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {_logUnauthorized(); return false;}
    if (project) project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);
    if ((!project) && (!roleman.isOrgAdminLoggedIn()) && (!roleman.isOrgAdminLoggedIn())) project=KLOUD_CONSTANTS.env.prj;

    const projectid = _getProjectID(project, org), sqltypes = (Array.isArray(types)?types:[types]);
    const sqltypesPlaceholders = sqltypes.map(_=>"?").join(",");
    const returnAllVMTypes = types.length == 1 && types[0].trim() == "*";

    const query = returnAllVMTypes ? (project ? "select * from vms where projectid = ? collate nocase and org = ? collate nocase ":
            "select * from vms where org = ? collate nocase ") : 
        (project?`select * from vms where projectid = ? collate nocase and org = ? collate nocase and vmtype in (${sqltypesPlaceholders}) collate nocase `:
            `select * from vms where org = ? collate nocase and vmtype in (${sqltypesPlaceholders}) collate nocase`);

    const results = await _db().getQuery(query, returnAllVMTypes ? (project?[projectid,org]:[org]) : 
        (project?[projectid,org,...sqltypes]:[org,...sqltypes]));
    if (results) for (const vm of results) try {vm.disks = JSON.parse(vm.disksjson);} catch (err) {
        KLOUD_CONSTANTS.LOGERROR(`Unable to parse disks for VM ${vm.name}`); vm.disks = [];}
    return results;
}

/**
 * Returns VMs for the given host. All VMs are returned if hostname is skipped. 
 * This is for cloud admins.
 * @param {array} types The VM types
 * @param {string} hostname The host (optional)
 * @return The list of VMs
 */
exports.listVMsForCloudAdmin = async (types, hostname) => {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource)) {_logUnauthorized(); return false;}

    const sqltypes = (Array.isArray(types)?types:[types]), sqltypesPlaceholders = sqltypes.map(_=>"?").join(",");

    const returnAllVMTypes = types.length == 1 && types[0].trim() == "*";

    const query = returnAllVMTypes ? (hostname ? "select * from vms where hostname = ? collate nocase" : 
            "select * from vms") : 
        (hostname ? `select * from vms where hostname = ? collate nocase and vmtype in (${sqltypesPlaceholders}) collate nocase` : 
            `select * from vms where vmtype in (${sqltypesPlaceholders}) collate nocase`);

    const results = await _db().getQuery(query, 
        returnAllVMTypes ? (hostname?[hostname]: []) : (hostname?[hostname, ...sqltypes]:[...sqltypes]));
    if (results) for (const vm of results) try {vm.disks = JSON.parse(vm.disksjson);} catch (err) {
        KLOUD_CONSTANTS.LOGERROR(`Unable to parse disks for VM ${vm.name}`); vm.disks = [];}
    return results;
}

/**
 * Adds the project to the DB if it doesn't exist for this org. Only admins
 * can add new projects.
 * @param {string} name The project name
 * @param {string} description The project description 
 * @param {string} orgIn The owning org, if skipped is auto detected 
 * @return true on success or false otherwise
 */
exports.addProject = async(name, description="", orgIn=KLOUD_CONSTANTS.env.org) => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_org)) {_logUnauthorized(); return false;}
    const project = roleman.getNormalizedProject(name), org = roleman.getNormalizedOrg(orgIn), id = _getProjectID(project, org);
        
    if (!await exports.getProject(name)) return await _db().runCmd(
        "insert into projects (id, name, org, description) values (?,?,?,?)", [id, name, org, description]);
    else return true;
}

/**
 * Returns the currently logged in user's (or given user, if called by cloudadmin) projects.
 * @param {string} userid The user whose projects are needed, only cloudadmin can use this param.
 * @returns The currently logged in or the given user's projects.
 */
exports.getUserProjects = async userid => {
    if (userid && (!roleman.checkAccess(roleman.ACTIONS.lookup_cloud_resource))) {_logUnauthorized(); return false;}
    if (!userid) userid = KLOUD_CONSTANTS.env.userid;
    const query = "select * from projects where id in (select projectid from projectusermappings where userid=? collate nocase)";
    const results = await _db().getQuery(query, userid);
    return results || [];
}

/**
 * Returns the project or all if name is null. For users it returns
 * projects they are mapped to, and for admins it goes across org projects
 * @param {string} name Project name
 */
exports.getProject = async (name, org=KLOUD_CONSTANTS.env.org) => {
    const userid = KLOUD_CONSTANTS.env.userid, projectid = `${(name||"undefined").toLocaleLowerCase()}_${org}`;
    org = roleman.getNormalizedOrg(org); 

    let results;
    if (roleman.isCloudAdminLoggedIn() || roleman.isOrgAdminLoggedIn()) {
        if (name) results = await _db().getQuery("select * from projects where id=? collate nocase and org=? collate nocase", 
            [projectid, org]);
        else results = await _db().getQuery("select * from projects where org=? collate nocase)", [org]);
    }
    else {
        if (name) results = await _db().getQuery("select * from projects where id in \
            (select projectid from projectusermappings where userid=? collate nocase) collate nocase and name=? collate nocase", [userid,name]);
        else results = await _db().getQuery("select * from projects where id in \
            (select projectid from projectusermappings where userid=? collate nocase) collate nocase", [userid]);
    }

    return results && results.length ? results[0] : null;
}

/**
 * Deletes the current project from the DB for this org. Only admins can delete.
 * @param {string} name The project name - only honored for cloud admins, else current project is used
 * @param {string} org The project org - only honored for cloud admins, else current org is used
 * @return true on success or false otherwise
 */
exports.deleteProject = async (name, org=KLOUD_CONSTANTS.env.org) => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_org)) {_logUnauthorized(); return false; }
    org = roleman.getNormalizedOrg(org); name = roleman.getNormalizedProject(name);

    const id = _getProjectID(name, org);
    const commandsToUpdate = [
        {
            cmd: "delete from projects where id = ? collate nocase", 
            params: [id]
        },
        {
            cmd: "delete from projectusermappings where projectid = ? collate nocase",
            params: [id]
        }
    ];
    const deleteResult = await _db().runTransaction(commandsToUpdate);
    return deleteResult;
}

/**
 * Changes given user's role, only admins can do this.
 * @param {string} email The user's email, must be unique
 * @param {string} role The user's role, only honored for 
 *                     cloud or org admins, else the user role is used
 * @param {string} org The user's organization, only honored for 
 *                     cloud admins, else the current org is used
 * @return true on succes, false otherwise
 */
exports.changeUserRole = async function(email, role, org) {
    if ((!roleman.isCloudAdminLoggedIn()) && (!roleman.isOrgAdminLoggedIn())) {_logUnauthorized(); return false;}

    const query = "update users set role = ? where id = ? collate nocase and org = ? collate nocase", 
        orgFixed = roleman.getNormalizedOrg(org), roleFixed = roleman.getNormalizedRole(role);
    return await _db().runCmd(query, [roleFixed, email, orgFixed]);
}

/**
 * Adds the given user to the DB
 * @param {string} email The user's email, must be unique
 * @param {string} name The user's name 
 * @param {string} org The user's organization, only honored for 
 *                     cloud admins, else the current org is used.
 * @param {string} role The user's role, only honored for 
 *                     cloud or org admins, else the user role is used.
 * @return true on succes, false otherwise
 */
exports.addUserToDB = async (email, name, org=KLOUD_CONSTANTS.env.org, role=KLOUD_CONSTANTS.ROLES.USER) => {
    if ((!await roleman.isSetupMode()) && (!roleman.checkAccess(roleman.ACTIONS.add_user_to_org))) {
        _logUnauthorized(); return false; }

    const query = "insert into users(id, name, org, role) values (?,?,?,?)", 
        orgFixed = roleman.getNormalizedOrg(org), roleFixed = roleman.getNormalizedRole(role);
    return await _db().runCmd(query, [email.toLocaleLowerCase(), name, orgFixed, roleFixed]);
}

/**
 * Removes the given user from the DB, assumption is that he is under the
 * same org as the admin removing him. Only admin can remove, anyone can add
 * as removal is a destructive operation.
 * @param {string} email The user's email
 * @param {string} org The user's organization, only honored for 
 *                     cloud admins, else the current org is used.
 * @return true on succes, false otherwise
 */
exports.removeUserFromDB = async (email, org=KLOUD_CONSTANTS.env.org) => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}

    const orgFixed = roleman.getNormalizedOrg(org), userid = email.toLocaleLowerCase();
    const userToDelete = await exports.getUserForEmail(email);
    if (roleman.isNormalUserLoggedIn() && (userToDelete.role != KLOUD_CONSTANTS.ROLES.USER)) {  // can't delete admins by users
        _logUnauthorized(); return false; }  

    const commandsToUpdate = [
        {
            cmd: "delete from users where id=? collate nocase and org=? collate nocase", 
            params: [userid, orgFixed]
        },
        {
            cmd: "delete from projectusermappings where userid=? collate nocase",
            params: [userid]
        }
    ];
    const deleteResult = await _db().runTransaction(commandsToUpdate);
    return deleteResult;
}

/**
 * Adds the given user to the currently logged in user's project
 * @param {string} userid The user ID to add 
 * @param {string} project The project to add to, only honored for org admins, 
 *                         else current project is used
 * @param {string} org The org, only honored for cloud admins.
 * @returns true on succes, false otherwise
 */
exports.addUserToProject = async (userid, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const query = "insert into projectusermappings(userid, projectid) values (?,?)"
    return await _db().runCmd(query, [userid, _getProjectID(project, org)]);
}

/**
 * Removes the given user from the project. This does not remove the 
 * user from the DB. So any current project user or admin can perform 
 * this operation.
 * @param {string} user The user ID to add 
 * @param {string} project The project to add to, only honored for org admins, 
 *                         else current project is used
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns true on succes, false otherwise
 */
exports.removeUserFromProject = async (user, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) => {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const query = "delete from projectusermappings where userid=? collate nocase and projectid=? collate nocase"
    return await _db().runCmd(query, [user, _getProjectID(project, org)]);
}

/**
 * Returns all currently registered admins, for an org, could be null in case of error.
 * Only cloud admin or an org admin can retrieve this list.
 * @param {string} org  The org, a case insensitive search will be performed. This param is only
 *                      honored if a cloud admin is logged in, else the org of the currently logged
 *                      in user will be used.
 */
exports.getAllAdmins = async (org=KLOUD_CONSTANTS.env.org) => {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_org)) {_logUnauthorized(); return false;}
    org = roleman.getNormalizedOrg(org);

    const users = await _db().getQuery(
        `select * from users where org = ? collate nocase and role = ${KLOUD_CONSTANTS.ROLES.ORG_ADMIN} collate nocase`, 
        [roleman.isCloudAdminLoggedIn()?org:KLOUD_CONSTANTS.env.org]);
    return users;
}

/**
 * Returns user account for the given email address. Any currently logged
 * in user from the org can fetch this.
 * @param {string} email Expected email address
 * @param {string} org The org, a case insensitive search will be performed. This param is only
 *            honored if a cloud admin is logged in, else the org of the currently logged
 *            in user will be used.
 * @return The account object or null on error
 */
exports.getUserForEmail = async (email, org=KLOUD_CONSTANTS.env.org) => {
    org = roleman.getNormalizedOrg(org);

    const users = await _db().getQuery("select * from users where id = ? collate nocase and org = ? collate nocase", 
        [email.toLocaleLowerCase(), roleman.isCloudAdminLoggedIn()?org:KLOUD_CONSTANTS.env.org]);
    if (users && users.length) return users[0]; else return null;
}

/**
 * Logs the given user in and sets up for environment variables
 * @param {string} email The email
 * @param {string} project The project the user will work on
 * @return true on success and false otherwise
 */
exports.loginUser = async (email, project=KLOUD_CONSTANTS.DEFAULT_PROJECT) => {
    const users = await _db().getQuery("select * from users where id = ? collate nocase", email.toLocaleLowerCase());
    if (!users || !users.length) return false;  // bad ID   
    return users[0];
}

/**
 * Checks that the user belongs to the given project
 * @param {string} userid The userid, if skipped is auto picked from the environment
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns true if the user belongs to the given project, else false
 */
exports.checkUserBelongsToProject = async function (userid=KLOUD_CONSTANTS.env.userid, 
        project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) {

    org = roleman.getNormalizedOrg(org);

    const projectid = _getProjectID(project, org);
    const check = await _db().getQuery("select projectid from projectusermappings where userid = ? collate nocase and projectid = ? collate nocase", 
        [userid, projectid]);
    if (!check || !check.length) return false;  // user isn't part of this project
    else return true;
}

/**
 * Adds the given object to the recycle bin table
 * @param {string} objectid The object ID
 * @param {string||object} object The object itself
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns true on success or false on failure
 */
exports.addObjectToRecycleBin = async function(objectid, object, project=KLOUD_CONSTANTS.env.prj, 
        org=KLOUD_CONSTANTS.env.org) {
            
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const id = `${org}_${project}_${objectid.toString()+"_"+Date.now()+Math.random().toString().split(".")[1]}`,
        objectJSON = JSON.stringify(object);
    const query = "insert into recyclebin (id, resourceid, object, org, projectid) values (?,?,?,?,?)";
    return await _db().runCmd(query, [id, objectid, objectJSON, org, project]);
}

/**
 * Returns the given recycle bin objects.
 * @param {string} objectid The object ID
 * @param {number} idstamp The particular object ID stamp (if not passed all matching objects are returned)
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns The objects, if found, else null. Can be one or more if the same object was deleted multiple times.
 */
exports.getObjectsFromRecycleBin = async function(objectid, idstamp="", project=KLOUD_CONSTANTS.env.prj, 
        org=KLOUD_CONSTANTS.env.org) {
            
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);
    if (idstamp && (!idstamp.startsWith(`${org}_${project}_${objectid.toString()}`))) { // don't let users get other org or project resources
        _logUnauthorized(); return false;}

    const id = idstamp||`${org}_${project}_${objectid.toString()}`; // if exact idstamp was provided then use it
    const query = idstamp ? "select * from recyclebin where id=? collate nocase" :
        "select * from recyclebin where id like ? collate nocase";
    const results = await _db().getQuery(query, [idstamp?id:id+"%"]);
    if (results) for (const result of results) result.object = JSON.parse(result.object);
    return results;
}

/**
 * Deletes the given objects, if it exists from the recycle bin.
 * @param {string} objectid The object ID
 * @param {number} idstamp The particular object ID stamp (if not passed all matching objects are deleted)
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns true on success or false on failure
 */
exports.deleteObjectsFromRecyclebin = async function(objectid, idstamp="", project=KLOUD_CONSTANTS.env.prj, 
        org=KLOUD_CONSTANTS.env.org) {

    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);
    if (idstamp && (!idstamp.startsWith(`${org}_${project}_${objectid.toString()}`))) { // don't let users delete other org or project resources
        _logUnauthorized(); return false;}

    const id = idstamp||`${org}_${project}_${objectid.toString()}`;
    const query = idstamp ? "delete from recyclebin where id=? collate nocase" : 
        "delete from recyclebin where id like ? collate nocase";
    return await _db().runCmd(query, [idstamp?id:id+"%"]);
}

/**
 * Deletes the given snapshot, if it exists in the DB.
 * @param {string} resource_id The resource ID for which this snapshot is for
 * @param {string} snapshot_id The snapshot ID
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns true on success or false on failure
 */
exports.deleteSnapshot = async function(resource_id, snapshot_id, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const id = `${org}_${project}_${resource_id}_${snapshot_id}`;
    const commandsToRun = [
        {
            cmd: "delete from snapshots where id=? collate nocase", 
            params:  [id]
        },
        {
            cmd: "delete from relationships where pk1=? collate nocase and pk2=? collate nocase",
            params: [id, resource_id]
        }
    ];
    const transactionResult = await _db().runTransaction(commandsToRun);
    return transactionResult;
}

/**
 * Deletes all snapshots for a given resource, if they exists in the DB.
 * @param {string} resource_id The resource ID for which this snapshot is for
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns true on success or false on failure
 */
exports.deleteAllSnapshotsForResource = async function(resource_id, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const commandsToRun = [
        {
            cmd: "delete from snapshots where id in (select pk1 from relationships where pk2=? collate nocase)", 
            params:  [resource_id]
        },
        {
            cmd: "delete from relationships where pk2 = ? and type = 'snapshot",
            params: [resource_id]
        }
    ];
    const deleteResult = await _db().runTransaction(commandsToRun);
    return deleteResult;
}

/**
 * Adds snapshot information to the database.
 * @param {string} resource_id The resource ID for which this snapshot is for
 * @param {string} snapshot_id The snapshot name or ID
 * @param {string} extrainfo Any additional information
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns true on success or false on failure 
 */
exports.addOrUpdateSnapshot = async function(resource_id, snapshot_id, extrainfo="", project=KLOUD_CONSTANTS.env.prj, 
        org=KLOUD_CONSTANTS.env.org) {

    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const id = `${org}_${project}_${resource_id}_${snapshot_id}`, projectid = _getProjectID(project, org)
    if (await exports.getSnapshot(snapshot_id, project, org)) { // don't allow adding same snapshot ID twice
        KLOUD_CONSTANTS.LOGERROR(`Snapshot with ID ${snapshot_id} already exists`); return false;}

    const commandsToRun = [
        {
            cmd: "replace into snapshots (id, snapshotname, extrainfo, org, projectid) values (?,?,?,?,?)", 
            params:  [id, snapshot_id, extrainfo, org, projectid]
        },
        {
            cmd: "replace into relationships (pk1, pk2, type) values (?,?,'snapshot')",
            params: [id, resource_id]
        }
    ];
    const insertResult = await _db().runTransaction(commandsToRun);
    return insertResult;
}

/**
 * Returns the given snapshot object.
 * @param {string} resource_id The resource ID for which this snapshot is for
 * @param {string} snapshot_id The snapshot ID
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns The snapshot object, if found, else null.
 */
exports.getSnapshot = async function(resource_id, snapshot_id, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const id = `${org}_${project}_${resource_id}_${snapshot_id}`;
    const query = "select * from snapshots where id=? collate nocase";
    const snapshots = await _db().getQuery(query, [id]);
    if (snapshots && snapshots.length) return snapshots[0]; else return null;
}

/**
 * Returns the list of snapshots for the given resource ID.
 * @param {string} resource_id The resource ID for which this snapshot is for
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns The list requested or null if none exist
 */
exports.listSnapshots = async function(resource_id, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const query = "select * from snapshots where id in (select pk1 from relationships where pk2=? collate nocase and type='snapshot')";
    const snapshots = await _db().getQuery(query, [resource_id]);
    if (snapshots && snapshots.length) return snapshots; else return null;
}

/**
 * Adds vnet information to the database.
 * @param {string} vnet_id The vnet name or ID
 * @param {string} description Any additional description for the Vnet
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns true on success or false on failure 
 */
exports.addOrUpdateVnet = async function(vnet_id, description="", project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) {

    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const id = `${org}_${project}_${vnet_id}`, projectid = _getProjectID(project, org);
    const cmd = "replace into vnets (id, name, description, org, projectid) values (?,?,?,?,?)", 
        params =  [id, vnet_id, description, org, projectid];
    const insertResult = await _db().runCmd(cmd, params);
    return insertResult;
}

/**
 * Returns the given vnet object.
 * @param {string} name The Vnet ID or name
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns The vnet object, if found, else null.
 */
exports.getVnet = async function(vnet_id, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const id = `${org}_${project}_${vnet_id}`;
    const query = "select * from vnets where id=? collate nocase";
    const vnets = await _db().getQuery(query, [id]);
    if (vnets && vnets.length) return vnets[0]; else return null;
}

/**
 * Returns the list of Vnets for the given project and org.
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns The list requested or null if none exist
 */
exports.listVnets = async function(project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const projectid = _getProjectID(project, org)
    const query = "select * from vnets where org=? and projectid=?";
    const vnets = await _db().getQuery(query, [org, projectid]);
    if (vnets && vnets.length) return vnets; else return null;
}

/**
 * Deletes the given vnet, if it exists in the DB.
 * @param {string} vnet_id The ID or name of the Vnet
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns true on success or false on failure
 */
exports.deleteVnet = async function(vnet_id, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    project = roleman.getNormalizedProject(project); org = roleman.getNormalizedOrg(org);

    const id = `${org}_${project}_${vnet_id}`;
    const query = "delete from vnets where id=? collate nocase";
    return await _db().runCmd(query, [id]);
}

/**
 * Adds the given VM to the Vnet
 * @param {string} vnet_id The Vnet name
 * @param {string} vm_name The VM name
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns true on success or false on failure
 */
exports.addOrUpdateVMToVnet = async function(vnet_id, vm_name, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    
    const id = `${org}_${project}_${vnet_id}`;
    const vm = exports.getVM(vm_name, project, org), vm_id = vm.id;

    const cmd = "replace into relationships (pk1, pk2, type) values (?,?,'vnetvm')", params =  [id, vm_id];
    const insertResult = await _db().runCmd(cmd, params);
    return insertResult;
}

/**
 * Removes the given VM from the given Vnet
 * @param {string} vnet_id The Vnet name
 * @param {string} vm_name The VM name
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns true on success or false on failure
 */
exports.deleteVMFromVnet = async function(vnet_id, vm_name, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {_logUnauthorized(); return false;}
    
    const id = `${org}_${project}_${vnet_id}`;
    const vm = exports.getVM(vm_name, project, org), vm_id = vm.id;

    const cmd = "delete from relationships pk1=? and pk2=? and type='vnetvm'", params =  [id, vm_id];
    const deleteResult = await _db().runCmd(cmd, params);
    return deleteResult;
}

/**
 * Returns the list of project resources allocated to the given Vnet
 * @param {string} vnet_id The Vnet name or ID
 * @param {string} type The relationship ID - for VMs it is 'vnetvm', for hosts it is 'vnethost'
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns The list of project resources allocated to the given Vnet
 */
exports.getResourcesForVnet = async function(vnet_id, type, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {_logUnauthorized(); return false;}
    
    const id = `${org}_${project}_${vnet_id}`;
    const query = type?"select pk2 from relationships where pk1=? and type=?":"select pk2 from relationships where pk1=?";
    const results = await _db().getQuery(query, type?[id, type]:[id]);
    return _objectArrayToFlatArray(results, "pk2");
}

/**
 * Returns the list of Vnets allocated to the resource
 * @param {string} resource_id The Vnet name or ID
 * @param {string} type The relationship ID - for VMs it is 'vnetvm', for hosts it is 'vnethost'
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns The list of project resources allocated to the given Vnet
 */
exports.getVnetsForResource = async function(resource_id, type) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {_logUnauthorized(); return false;}
    
    const query = "select pk1 from relationships where pk2=? and type=?";
    const results = await _db().getQuery(query, [resource_id, type]);
    return _objectArrayToFlatArray(results, "pk1");
}

/**
 * Adds Vnet resource mapping.
 * @param {string} vnet_id The Vnet ID
 * @param {string} pk2 The resource
 * @param {string} type Mapping type - for VMs it is 'vnetvm', for hosts it is 'vnethost'
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns true on success and false on failure
 */
exports.addVnetResource = async (vnet_id, pk2, type, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) => 
    exports.addOrUpdateRelationship(`${org}_${project}_${vnet_id}`, pk2, type, true);

/**
 * Deletes Vnet resource mapping.
 * @param {string} vnet_id The Vnet ID
 * @param {string} type Mapping type - for VMs it is 'vnetvm', for hosts it is 'vnethost'
 * @param {string} project The project, if skipped is auto picked from the environment
 * @param {string} org The org, if skipped is auto picked from the environment
 * @returns true on success and false on failure
 */
exports.deleteVnetResource = async (vnet_id, type, project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) => 
    exports.deleteRelationship(`${org}_${project}_${vnet_id}`, type)

/**
 * Returns the terminating hostname for the given IP
 * @param {string} ip The IP
 * @param {boolean} for_allocation If true only return if it is not allocated already
 * @returns The terminating hostname for the given IP
 */
exports.getHostForIP = async function(ip, for_allocation) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {_logUnauthorized(); return false;}
    
    const query = for_allocation?"select hostname from ip where ip=? and allocatedto=''":"select hostname from ip where ip=?";
    const results = await _db().getQuery(query, [ip]);
    return results[0]?.hostname;
}

/**
 * Adds the IP to the given Host. Which can later be allocated to VMs.
 * @param {string} ip The IP to add
 * @param {string} hostname The hostname where this IP is routed to.
 * @returns true on success, false on failure
 */
exports.addHostIP = async function(ip, hostname) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_cloud_resource)) {_logUnauthorized(); return false;}
    
    const cmd = "insert into ip(ip,hostname) values(?,?)", params =  [ip,hostname];
    const insertResult = await _db().runCmd(cmd, params);
    return insertResult;
}

/**
 * Allocates the IP to the given resource. To unallocate, set resource_allocated_to to
 * blank or null.
 * @param {string} ip The IP to allocate or unallocated
 * @param {string} resource_allocated_to The resource to allocate to
 * @returns true on success, false on failure
 */
exports.allocateIP = async function(ip, resource_allocated_to) {
    if (!roleman.checkAccess(roleman.ACTIONS.lookup_project_resource)) {_logUnauthorized(); return false;}
    
    const cmd = "update ip set allocatedto=? where ip=?", params =  [resource_allocated_to||"", ip];
    const updateResult = await _db().runCmd(cmd, params);
    return updateResult;
}

/**
 * Unallocates the given IP
 * @param {string} ip The IP to unallocate
 * @returns true on success, false on failure
 */
exports.unallocateIP = async ip => exports.allocateIP(ip);

/**
 * Runs the given SQL on the DB blindly. Must be very careful. Only cloud admins can run this.
 * @param sql The SQL to run on the DB.
 * @return The results of the SQL.
 */
exports.runSQL = async function(sql) {
    if (!roleman.isCloudAdminLoggedIn()) {_logUnauthorized(); return false;}
    if (sql.toLocaleLowerCase().startsWith("select")) return await _db().getQuery(sql);
    else return await _db().runCmd(sql);
}

/**
 * Adds a reationship.
 * @param {string} pk1 Primary Key 1
 * @param {string} pk2 Primary Key 2
 * @param {string} type The type of relationship
 * @param {boolean} pk1pk2typeUniqueConstraint If true then pk1 and pk2 and type is a unique relationship
 * @returns true on success and false on failure.
 */
exports.addOrUpdateRelationship = async function(pk1, pk2, type, pk1pk2typeUniqueConstraint) {
    let cmd = "insert into relationships (type, pk1, pk2) values (?,?,?)";
    if (pk1pk2typeUniqueConstraint) {
        const checkCmd = "select * from relationships where pk1=? and pk2=?", params =  [pk1, pk2];
        const result = await _db().getQuery(checkCmd, params), relationshipExists = result && result.length;
        if (relationshipExists && (result[0].type == type)) return;   // same relationship exists already
        if (relationshipExists) cmd = "update relationships set type=? where pk1=? and pk2=?)";
    }
    const cmdResult = await _db().runCmd(cmd, [type, pk1, pk2]);
    return cmdResult;
}

/**
 * Returns relationships
 * @param primary_key Either of the primary keys to select
 * @param type The type of relationship
 * @return The results of the SQL.
 */
exports.getRelationships = async function(primary_key, type) {
    const cmd = "select * from relationships where pk1=? or pk2=? and type=?", params =  [primary_key, primary_key, type];
    const result = await _db().runCmd(cmd, params);
    return result;
}

/**
 * Returns relationships
 * @param primary_key Either of the primary keys to select
 * @param type The type of relationship
 * @return The results of the SQL.
 */
exports.deleteRelationship = async function(primary_key, type) {
    const cmd = "delete from relationships where pk1=? or pk2=? and type=?", params =  [primary_key, primary_key, type];
    const result = await _db().runCmd(cmd, params);
    return result;
}

const _logUnauthorized = _ => KLOUD_CONSTANTS.LOGERROR("User is not authorized.");

const _getProjectID = (project=KLOUD_CONSTANTS.env.prj, org=KLOUD_CONSTANTS.env.org) => 
    `${roleman.getNormalizedProject(project)}_${roleman.getNormalizedOrg(org)}`;

function _objectArrayToFlatArray(arrayOfObjects, key) {
    const results = []; for (const objectThis of (arrayOfObjects||[])) if (objectThis[key]) results.push(objectThis[key]);
    return results;
}

async function _initMonkshuGlobalAndGetDBModuleAsync() {
    const monkshuDBWrapped = await monkshubridge.initMonkshuGlobalAndGetModuleAsync("db");
    const dbDriverMonkshu = await monkshuDBWrapped.getDBDriver("sqlite", KLOUDUST_MAIN_DBFILE, dbschema);
    const monkshuDBDriverWrapped = kdutils.wrapObjectInNewContext(dbDriverMonkshu, {CONSTANTS, LOG});
    const db = monkshuDBDriverWrapped; await db.init(); return db;
}

const _db = _ => KLOUD_CONSTANTS.env.db;