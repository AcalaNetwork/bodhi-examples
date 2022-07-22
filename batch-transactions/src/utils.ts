import { ContractFactory, Contract, BigNumber } from 'ethers';
import { Signer } from '@acala-network/bodhi';
import { toBN } from './utils-from-bodhi';

import uniFactoryContract from './UniswapV2Factory.json';
import uniRouterContract from './UniswapV2Router.json';
import IUniswapV2Pair from './IUniswapV2Pair.json';
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

export const getCallExtrinsic = async (signer: Signer, abi: any, contractAddr: string, method: string, args: any[] = [], force = false) => {
  console.log('getCallExtrinsic', args)
  const contract = new Contract(contractAddr, abi, signer);
  const data = contract.interface.encodeFunctionData(method, args);

  const evmAddress = await signer.getAddress();
  // console.log('!!!!!!!!!!!!')
  // const tx = await signer.populateTransaction({
  //   data,
  //   to: contractAddr,
  //   from: evmAddress,
  // });

  // console.log(tx)

  let gasLimit = BigNumber.from(21000000);
  let storageLimit = BigNumber.from(64000);
  try {
    const { gas, storage } = await signer.provider.estimateResources({
      data,
      to: contractAddr,
      from: evmAddress,
      value: 0,
    });

    gasLimit = gas;
    storageLimit = storage;
  } catch (err) {
    if (force) {
      console.log('---------- ❗ tx dry run failed ----------\n', err, '\n-------------------------------------------\n👌 but don\'t worry we will still force sending it', '\n⭐️ maybe some magic will happen ...');
    } else {
      throw err;
    }
  }

  return signer.provider.api.tx.evm.call(
    contractAddr,
    data,
    toBN(0),
    toBN(gasLimit),
    toBN(storageLimit),
    []
  );
};

/* ----------------------------
     extrinsic constructors
------------------------------- */
export const getUniFactoryDeployExtrinsic = async (signer: Signer, addr: string) => (
  getDeployExtrinsic(signer, uniFactoryContract.abi, uniFactoryContract.bytecode, [addr])
);

const DUMMY_WETH_ADDR = '0xB7d729C983b819611E68DAee71b4A2C950f86dc8';
export const getUniRouterDeployExtrinsic = async (signer: Signer, factoryAddr:string) => (
  getDeployExtrinsic(signer, uniRouterContract.abi, uniRouterContract.bytecode, [factoryAddr, DUMMY_WETH_ADDR])
);

export const getTokenDeployExtrinsic = async (signer: Signer, args: any[]) => (
  getDeployExtrinsic(signer, tokenContract.abi, tokenContract.bytecode, args)
);

export const getTokenApproveExtrinsic = async (signer: Signer, contractAddr: string, args: any[]) => (
  getCallExtrinsic(signer, tokenContract.abi, contractAddr, 'approve', args)
);

export const getAddLiquidityExtrinsic = async (signer: Signer, contractAddr: string, args: any[], force = false) => (
  getCallExtrinsic(signer, uniRouterContract.abi, contractAddr, 'addLiquidity', args, force)
);

/* ----------------------------
          query helpers
------------------------------- */
export const queryTokenBalance = async (signer: Signer, tokenAddr: string, addr: string): Promise<string> => {
  const contract = new Contract(tokenAddr, tokenContract.abi, signer);

  const res = await contract.callStatic.balanceOf(addr);
  return res.toString();
};

export const queryTokenAllowance = async (signer: Signer, tokenAddr: string, ownerAndSpender: [string, string]): Promise<string> => {
  const contract = new Contract(tokenAddr, tokenContract.abi, signer);

  const res = await contract.callStatic.allowance(...ownerAndSpender);
  return res.toHexString();
};

export const queryLiquidity = async (signer: Signer, uniCoreAddr: string, tokens: [string, string]) => {
  const uniCore = new Contract(uniCoreAddr, uniFactoryContract.abi, signer);
  const pairAddress = await uniCore.getPair(...tokens);
  const pair = new Contract(pairAddress, IUniswapV2Pair.abi, signer);

  const res = await pair.callStatic.balanceOf(await signer.getAddress());
  return res.toString();
};
