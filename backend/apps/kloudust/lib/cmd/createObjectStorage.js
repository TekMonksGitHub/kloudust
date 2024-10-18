/** 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const {xforge} = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);

const MINIO_ROOT_USER = "kdstorage";
const MINIO_ROOT_PASSWORD = "kdstorage";

module.exports.exec = async function(params) {
    if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) {params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT();}

    const [bucket_name,bucket_description,bucket_size,password] = [...params];

    const isBucketExist = await dbAbstractor.getBucket(bucket_name);
    if(isBucketExist != null) {
        params.consoleHandlers.LOGERROR(`Bucket with the name ${bucket_name} exists already`); 
        const error = `Bucket with the name ${bucket_name} exists already`;
        return CMD_CONSTANTS.FALSE_RESULT(error);
    }

    const hostInfo = await dbAbstractor.getHostEntry("host1"); 
    if (!hostInfo) {params.consoleHandlers.LOGERROR("Unable to find a suitable host."); return CMD_CONSTANTS.FALSE_RESULT();}
    const cluster_vm = await dbAbstractor.getClusterVM("kdobjectstorage");
    const createBucketParams = {
        vm_name : "kdobj",
        MINIO_ROOT_PASSWORD,
        MINIO_ROOT_USER,
        bucket_name : params[0],
        bucket_description:params[1],
        bucket_size: params[2],
        password:params[3]  
    }
    if (cluster_vm) {  
        return await _createBucket(createBucketParams,hostInfo);
    }else{
        const createVM_params = ['kdobj', 'kdobj test', '2', '4096', '80', 'kdjammy_22_04_amd64',`{system_info: {default_user: {name: storageadm, home: /home/storageadm, sudo: 'ALL=(ALL) NOPASSWD:ALL'}}, password: storageadm, chpasswd: {expire: false}, hostname: kdobj, ssh_pwauth: true, package_upgrade: true, runcmd: [['sudo','sed','-i','-e','s/MINIO_ROOT_USER.*/MINIO_ROOT_USER=${MINIO_ROOT_USER}/g','/etc/default/minio'],['sudo','sed','-i','-e','s/MINIO_ROOT_PASSWORD.*/MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}/g','/etc/default/minio'],['sudo','systemctl','enable','kdobjectstorage.service'],['sudo','systemctl','start','kdobjectstorage.service']]}`, 'false', '', '', '', 'kdobjectstorage', 'false',''];
        createVM_params.consoleHandlers = params.consoleHandlers;
        const vm = await createVM.exec(createVM_params);
        if(!vm.result) return CMD_CONSTANTS.FALSE_RESULT();
        return await _createBucket(createBucketParams,hostInfo);  
    }
}
const _createBucket = async (params,hostInfo) => {
    const xforgeArgs = {
        colors: KLOUD_CONSTANTS.COLORED_OUT, 
        file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
        console: params.consoleHandlers,
        other: [
            hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey,
            `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/createBucket.sh`,params.vm_name,params.MINIO_ROOT_USER,params.MINIO_ROOT_PASSWORD,params.bucket_name,exports.resolveBucketName(params.bucket_name),KLOUD_CONSTANTS.env.userid,params.bucket_size,params.password?params.password:null
        ]
    }
    const results = await xforge(xforgeArgs);
    if (results.result) {
        if (await dbAbstractor.addOrUpdateBucketToDB(params.bucket_name,KLOUD_CONSTANTS.env.userid, params.bucket_description, params.bucket_size,)) return results;
        else {params.consoleHandlers.LOGERROR("DB failed"); return {...results, result: false};}
    } else return results;
}
/** @return The internal bucket name for the given raw bucket name or null on error */
exports.resolveBucketName = bucket_name_raw => bucket_name_raw?`${KLOUD_CONSTANTS.env.org}_${KLOUD_CONSTANTS.env.prj}_${bucket_name_raw}`.toLowerCase().replace(/\s/g,"_"):null;
