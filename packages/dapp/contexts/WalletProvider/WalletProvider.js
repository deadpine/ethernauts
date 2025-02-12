import { providers } from 'ethers';
import Web3Modal from 'web3modal';
import WalletConnectProvider from '@walletconnect/web3-provider';
import { createContext, useCallback, useEffect, useReducer } from 'react';

import { INFURA_PROJECT_ID } from '../../config';

const providerOptions = {
  walletconnect: {
    package: WalletConnectProvider,
    options: {
      infuraId: INFURA_PROJECT_ID,
      rpc: {
        10: 'https://mainnet.optimism.io',
        69: 'https://kovan.optimism.io/',
      },
    },
  },
};

let web3Modal;

if (typeof window !== 'undefined') {
  web3Modal = new Web3Modal({
    cacheProvider: true,
    providerOptions,
  });
}

const initialState = {
  balance: null,
  provider: null,
  web3Provider: null,
  address: null,
  chainId: null,
};

const reducer = (state, action) => {
  /* eslint-disable indent */
  switch (action.type) {
    case 'SET_PROVIDER':
      return {
        ...state,
        balance: action.balance,
        provider: action.provider,
        web3Provider: action.web3Provider,
        address: action.address,
        signer: action.signer,
        chainId: action.chainId,
      };
    case 'SET_BALANCE':
      return {
        ...state,
        balance: action.balance,
      };

    case 'SET_ADDRESS':
      return {
        ...state,
        balance: action.balance,
        address: action.address,
      };
    case 'RESET_PROVIDER':
      return initialState;
    default:
      throw new Error(`Unhandled action type: ${action.type}`);
  }
  /* eslint-enable indent */
};

const WalletContext = createContext();

const WalletProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const { provider, web3Provider, address } = state;

  const connect = useCallback(async () => {
    const provider = await web3Modal.connect();

    const web3Provider = new providers.Web3Provider(provider, 'any');

    const signer = web3Provider.getSigner();
    const address = await signer.getAddress();
    const balance = await web3Provider.getBalance(address);
    const { chainId } = await web3Provider.getNetwork();

    dispatch({
      type: 'SET_PROVIDER',
      balance,
      provider,
      web3Provider,
      address,
      chainId,
    });
  }, []);

  const disconnect = useCallback(async () => {
    if (web3Provider && web3Provider.close) {
      await web3Provider.close();
    }
    await web3Modal.clearCachedProvider();

    localStorage.removeItem('walletconnect');

    dispatch({
      type: 'RESET_PROVIDER',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // Auto connect to the cached provider
  useEffect(() => {
    if (web3Modal.cachedProvider) {
      connect();
    }
  }, [connect]);

  const setBalance = useCallback(async () => {
    if (!web3Provider) return;

    const balance = await web3Provider.getBalance(address);

    dispatch({
      type: 'SET_BALANCE',
      balance,
    });
  }, [provider]);

  useEffect(() => {
    if (provider && provider.on) {
      const handleAccountsChanged = async (accounts) => {
        const balance = await web3Provider.getBalance(accounts[0]);

        dispatch({
          type: 'SET_ADDRESS',
          address: accounts[0],
          balance,
        });
      };

      const handleChainChanged = () => {
        // Ref: https://docs.ethers.io/v5/single-page/#/v5/concepts/best-practices/-%23-best-practices--network-changes
        window.location.reload();
      };

      const handleDisconnect = (error) => {
        // eslint-disable-next-line no-console
        console.log('disconnect', error);
        disconnect();
      };

      provider.on('accountsChanged', handleAccountsChanged);
      provider.on('chainChanged', handleChainChanged);
      provider.on('disconnect', handleDisconnect);

      // Subscription Cleanup
      return () => {
        if (provider.removeListener) {
          provider.removeListener('accountsChanged', handleAccountsChanged);
          provider.removeListener('chainChanged', handleChainChanged);
          provider.removeListener('disconnect', handleDisconnect);
        }
      };
    }
  }, [provider, disconnect]);

  const value = { state, connect, disconnect, setBalance };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

export { WalletProvider, WalletContext };
