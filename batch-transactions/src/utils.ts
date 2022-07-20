import { ContractFactory } from 'ethers';
import { Provider, Signer } from '@acala-network/bodhi';
import { toBN } from './utils-from-bodhi';

import dexContract from './Dex.json';
import tokenContract from './Token.json';

// TODO: add and export this util in bodhi
export const getDeployExtrinsic = async (signer: Signer, abi: any, bytecode: string, args: any[] = []) => {
  const factory = new ContractFactory(abi, bytecode, signer);

  const evmAddress = await signer.getAddress();
  const tx = await signer.populateTransaction({
    ...factory.getDeployTransaction(...args),
    from: evmAddress,
  });

  const {
    gas: gasLimit,
    storage: storageLimit,
  } = await signer.provider.estimateResources(tx);

  return signer.provider.api.tx.evm.create(
    tx.data,
    toBN(tx.value),
    toBN(gasLimit),
    toBN(storageLimit.isNegative() ? 0 : storageLimit),
    tx.accessList || []
  );
};

export const getDexDeployExtrinsic = async (signer: Signer) => (
  getDeployExtrinsic(signer, dexContract.abi, dexContract.bytecode)
);

export const getTokenDeployExtrinsic = async (signer: Signer, args: any[]) => (
  getDeployExtrinsic(signer, tokenContract.abi, tokenContract.bytecode, args)
);
