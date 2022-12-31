export type Config = {
  pssk: string;
  outerServer: {
    port: number;
    hostname: string;
  };
  symmetricEncryption: {
    enabled: boolean;
    algorithm: string;
    secret: string;
  };
  ssl: {
    enabled: boolean;
    pemFilePath: string;
    keyFilePath: string;
    certFilePath: string;
  };
  loadBalancing: {
    algorithm: string;
  };
  incomingConnection: {
    maxCount: number;
  };
};
