const path = require('path');
const fs = require('fs/promises');
const { inspect } = require('util');
const fleek = require('./fleek');
const config = require('./config');
const { JOB_PROCESS_BATCH, JOB_UPDATE_BASE_URL, JOB_UPLOAD_RESOURCE } = require('./constants');

const jobs = {
  /**
   * Generate all the necessary jobs for uploading the assets
   */
  [JOB_PROCESS_BATCH]: async function ({ batchNumber, batchSize }, { Ethernauts, queue }) {
    const randomNumber = await Ethernauts.getRandomNumberForBatch(batchNumber);
    const offset = Number(randomNumber.mod(batchSize));

    const minTokenIdInBatch = batchSize * batchNumber;
    const maxTokenIdInBatch = batchSize * (batchNumber + 1) - 1;

    const children = [];
    for (let tokenId = minTokenIdInBatch; tokenId <= maxTokenIdInBatch; tokenId++) {
      let assetId = tokenId + offset;
      if (assetId > maxTokenIdInBatch) assetId -= batchSize;

      children.push({
        name: JOB_UPLOAD_RESOURCE,
        queueName: config.MINTS_QUEUE_NAME,
        data: { tokenId, assetId },
      });
    }

    await queue.add({
      name: JOB_UPDATE_BASE_URL,
      queueName: config.MINTS_QUEUE_NAME,
      children,
    });

    return { batchNumber, minTokenIdInBatch, maxTokenIdInBatch };
  },

  /**
   * Upgrade the latest folder uri from IPFS
   */
  [JOB_UPDATE_BASE_URL]: async function (_, { Ethernauts }) {
    let baseUriHash = await fleek.getFolderHash(config.FLEEK_METADATA_FOLDER);

    if (!baseUriHash.startsWith('ipfs://')) baseUriHash = `ipfs://${baseUriHash}`;
    if (!baseUriHash.endsWith('/')) baseUriHash += '/';

    const tx = await Ethernauts.setBaseURI(baseUriHash);
    await tx.wait();

    return { baseUriHash };
  },

  /**
   * Get a mint process job and upload to necessary asset to IPFS
   */
  [JOB_UPLOAD_RESOURCE]: async function ({ tokenId, assetId }) {
    const metadataKey = `${config.FLEEK_METADATA_FOLDER}/${tokenId}`;
    const assetKey = `${config.FLEEK_ASSETS_FOLDER}/${tokenId}.png`;

    const exists = await fleek.fileExists({
      key: metadataKey,
    });

    if (exists) {
      console.warn(`Resource with tokenId "${tokenId}" already uploaded`);
      return;
    }

    const metadataPath = path.join(config.RESOURCES_METADATA_FOLDER, `${assetId}.json`);
    const assetPath = path.join(config.RESOURCES_ASSETS_FOLDER, `${assetId}.png`);

    // Include TokenId in Metadata
    const data = JSON.parse(await fs.readFile(metadataPath));
    data.name = `EthernautDAO #${tokenId}`;
    data.external_url = `https://mint.ethernautdao.io/nft/${tokenId}`;
    await fs.writeFile(metadataPath, JSON.stringify(data, null, 2));

    const [metadata, asset] = await Promise.all([
      fleek.uploadFile({
        key: metadataKey,
        location: metadataPath,
      }),
      fleek.uploadFile({
        key: assetKey,
        location: assetPath,
      }),
    ]);

    return {
      tokenId,
      assetId,
      metadata,
      asset,
    };
  },
};

module.exports = function processJobs(ctx) {
  return async function processJob(job) {
    if (!jobs[job.name]) {
      throw new Error(`Invalid job: ${JSON.stringify(job)}`);
    }

    const result = await jobs[job.name](job.data, ctx);

    console.log('Job Completed: ', inspect(result));

    return result;
  };
};
