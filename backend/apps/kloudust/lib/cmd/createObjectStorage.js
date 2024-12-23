/** 
 * createObjectStorage.js - Creates Object storage(s3storage).
 * 
 * (C) 2020 TekMonks. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const roleman = require(`${KLOUD_CONSTANTS.LIBDIR}/roleenforcer.js`);
const { xforge } = require(`${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/xforge`);
const hostchooser = require(`${KLOUD_CONSTANTS.LIBDIR}/hostchooser.js`);
const dbAbstractor = require(`${KLOUD_CONSTANTS.LIBDIR}/dbAbstractor.js`);
const CMD_CONSTANTS = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/cmdconstants.js`);
const createVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createVM.js`);
const createDockerVM = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/createDockerVM.js`);
const portForward = require(`${KLOUD_CONSTANTS.LIBDIR}/cmd/portForward.js`);
const crypt = require(`${CONSTANTS.LIBDIR}/crypt.js`);
const Minio = require('minio');

module.exports.exec = async function (params) {
  if (!roleman.checkAccess(roleman.ACTIONS.edit_project_resource)) { params.consoleHandlers.LOGUNAUTH(); return CMD_CONSTANTS.FALSE_RESULT(); }

  const [bucket_name, bucket_description, bucket_size, password, cloudinit, vm_type] = params

  const createBucketParams = {
    vm_name: KLOUD_CONSTANTS.S3DOCKERCONF.DOCKER_VM_PARAM.VM_NAME,
    MINIO_ROOT_PASSWORD: crypt.decrypt(KLOUD_CONSTANTS.S3DOCKERCONF.MINIO_ROOT_PASSWORD),
    MINIO_ROOT_USER: crypt.decrypt(KLOUD_CONSTANTS.S3DOCKERCONF.MINIO_ROOT_USER),
    bucket_name: bucket_name,
    bucket_size: bucket_size,
    password: password,
    consoleHandlers: params.consoleHandlers
  }

  const hostInfo = await hostchooser.getHostFor();
  if (!hostInfo) { params.consoleHandlers.LOGERROR("Unable to find a suitable host."); return CMD_CONSTANTS.FALSE_RESULT(); }

  if (!(await doesDockerVMexist(vm_type)).result) {
    const dockerVM = await createDockerVM.exec(KLOUD_CONSTANTS.S3DOCKERCONF.minioDockerFile.replace(/"/g, '\\"'), KLOUD_CONSTANTS.S3DOCKERCONF.S3STORAGE_DEFAULT_PORT, params, KLOUD_CONSTANTS.S3DOCKERCONF.MINIO_DOCKER_IMG, KLOUD_CONSTANTS.S3DOCKERCONF.S3STORAGE_DOCKER_BUILD);
    if (!dockerVM.result) {
      const error = `Error creating bucket ${bucket_name}`;
      params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
    }

    params.docker_vm_name = KLOUD_CONSTANTS.S3DOCKERCONF.DOCKER_VM_PARAM.VM_NAME;

    const isPortForward = await portForward.exec(params);
    if (!isPortForward.result) {
      const error = `Error in fetching docker port ${KLOUD_CONSTANTS.S3DOCKERCONF.S3STORAGE_DEFAULT_PORT}`;
      params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
    }
  }
  const isBucketCreated = await createBucket(bucket_name, hostInfo);
  if (!isBucketCreated.result) {
    const error = `Error in creating bucket ${bucket_name} with ${isBucketCreated.error}`;
    params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
  }

  const addMinioUser = await _addMinioUser(createBucketParams, hostInfo);
  if (!addMinioUser.result) {
    const error = `Error in adding user ${KLOUD_CONSTANTS.env.userid} to bucket ${bucket_name}`;
    params.consoleHandlers.LOGERROR(error); return CMD_CONSTANTS.FALSE_RESULT(error);
  }
  else {
    if (await dbAbstractor.addOrUpdateBucketToDB(bucket_name, exports.resolveBucketName(bucket_name), KLOUD_CONSTANTS.env.userid, bucket_description, bucket_size, createVM.resolveVMName(createBucketParams.vm_name))) return isBucketCreated;
    else { params.consoleHandlers.LOGERROR("DB failed"); return { ...isBucketCreated, result: false }; }
  }
}

async function doesDockerVMexist(vmtype) {
  const result = await dbAbstractor.getDockerVM(vmtype);
  if (!result) return CMD_CONSTANTS.FALSE_RESULT();
  else return CMD_CONSTANTS.TRUE_RESULT()
}

const _addMinioUser = async (params, hostInfo) => {
  const xforgeArgs = {
    colors: KLOUD_CONSTANTS.COLORED_OUT,
    file: `${KLOUD_CONSTANTS.LIBDIR}/3p/xforge/samples/remoteCmd.xf.js`,
    console: params.consoleHandlers,
    other: [
      hostInfo.hostaddress, hostInfo.rootid, hostInfo.rootpw, hostInfo.hostkey, hostInfo.port,
      `${KLOUD_CONSTANTS.LIBDIR}/cmd/scripts/addMinioUser.sh`, params.vm_name, params.MINIO_ROOT_USER, params.MINIO_ROOT_PASSWORD, params.bucket_name, params.bucket_size, KLOUD_CONSTANTS.env.userid, params.password, exports.resolveBucketName(params.bucket_name)
    ]
  }
  const results = await xforge(xforgeArgs);
  return results;
}

async function createBucket(bucket_name, hostInfo) {
  const minioClient = new Minio.Client({
    endPoint: hostInfo.hostaddress,
    port: KLOUD_CONSTANTS.S3DOCKERCONF.S3STORAGE_DEFAULT_PORT,
    useSSL: false,
    accessKey: crypt.decrypt(KLOUD_CONSTANTS.S3DOCKERCONF.MINIO_ROOT_USER),
    secretKey: crypt.decrypt(KLOUD_CONSTANTS.S3DOCKERCONF.MINIO_ROOT_PASSWORD),
  });

  try {
    LOG.info('Attempting to create bucket...');
    await minioClient.makeBucket(bucket_name);
    LOG.info(`${bucket_name} Bucket created successfully`);
    return { result: true, msg: 'Bucket created successfully' };
  } catch (error) {
    LOG.error('Error creating bucket:', error.message);
    LOG.error(error);
    return { result: false, error: error };
  }
}

exports.resolveBucketName = bucket_name_raw => bucket_name_raw ? `${bucket_name_raw}_${KLOUD_CONSTANTS.env.org}_${KLOUD_CONSTANTS.env.prj}`.toLowerCase().replace(/\s/g, "_") : null;