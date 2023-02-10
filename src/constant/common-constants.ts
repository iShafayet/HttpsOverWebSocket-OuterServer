const constants = {
  config: {
    CONFIG_DIRECTORY_NAME: "hows-os",
    CONFIG_FILE_NAME: "config.json",
  },
  data: {
    CHUNK_SIZE_BYTES: 100_000,
  },
  socketIdleCheckThreshold: 30_000,
  socketIdleRejectionThreshold: 60_000,
  pruningAttemptInterval: 1_000,
};

export default constants;
