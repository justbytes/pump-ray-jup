export type Data = {
  id: string;
  success: boolean;
  data: [
    {
      programId: string;
      id: string;
      mintA: {
        chainId: number;
        address: string;
        programId: string;
        logoURI: string;
        symbol: string;
        name: string;
        decimals: number;
        tags: [];
        extensions: {};
      };
      mintB: {
        chainId: number;
        address: string;
        programId: string;
        logoURI: string;
        symbol: string;
        name: string;
        decimals: number;
        tags: [];
        extensions: {};
      };
      lookupTableAccount: string;
      openTime: string;
      vault: {
        A: string;
        B: string;
      };
      authority: string;
      openOrders: string;
      targetOrders: string;
      mintLp: {
        chainId: number;
        address: string;
        programId: string;
        logoURI: '';
        symbol: '';
        name: '';
        decimals: number;
        tags: [];
        extensions: {};
      };
      marketProgramId: string;
      marketId: string;
      marketAuthority: string;
      marketBaseVault: string;
      marketQuoteVault: string;
      marketBids: string;
      marketAsks: string;
      marketEventQueue: string;
    }
  ];
};
