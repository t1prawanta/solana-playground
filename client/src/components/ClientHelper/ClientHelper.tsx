import { useCallback, useEffect, useState } from "react";
import { useAtom } from "jotai";
import styled from "styled-components";
import { useConnection } from "@solana/wallet-adapter-react";

import { useCurrentWallet } from "../Panels/Wallet";
import { explorerAtom, refreshExplorerAtom } from "../../state";
import { EventName } from "../../constants";
import { PgExplorer, PgTerminal } from "../../utils/pg";

// Only for type
import { PgClient } from "../../utils/pg/client";

const ClientHelper = () => {
  const [explorer] = useAtom(explorerAtom);
  const [explorerChanged] = useAtom(refreshExplorerAtom);

  const { connection } = useConnection();
  const { currentWallet: wallet } = useCurrentWallet();

  const [client, setClient] = useState<PgClient>();

  const getClient = useCallback(async () => {
    if (!client) {
      // Redefine console.log to show mocha logs in the terminal
      // This must be defined before PgClient is imported
      console.log = PgTerminal.consoleLog;

      const { PgClient } = await import("../../utils/pg/client");

      const client = new PgClient();
      setClient(client);
      return client;
    }

    return client;
  }, [client]);

  useEffect(() => {
    const handle = (
      e: UIEvent & { detail: { isTest?: boolean; path?: string } }
    ) => {
      PgTerminal.run(async () => {
        if (!explorer) return;

        const isTest = e.detail.isTest;
        const path = e.detail.path;

        PgTerminal.logWasm(
          PgTerminal.info(`Running ${isTest ? "tests" : "client"}...`)
        );

        const client = await getClient();

        if (path) {
          const code = explorer.getFileContent(path);
          if (!code) return;
          const fileName = PgExplorer.getItemNameFromPath(path);
          await client.run(code, fileName, wallet, connection, {
            isTest,
          });

          return;
        }

        const folderPath = explorer.appendToCurrentWorkspacePath(
          isTest ? PgExplorer.TESTS_DIRNAME : PgExplorer.CLIENT_DIRNAME
        );
        const folder = explorer.getFolderContent(folderPath);
        if (!folder.files.length && !folder.folders.length) {
          let DEFAULT;
          if (isTest) {
            PgTerminal.logWasm(PgTerminal.info("Creating default test..."));
            DEFAULT = client.DEFAULT_TEST;
          } else {
            PgTerminal.logWasm(PgTerminal.info("Creating default client..."));
            DEFAULT = client.DEFAULT_CLIENT;
          }

          const fileName = DEFAULT[0];
          const code = DEFAULT[1];
          await explorer.newItem(folderPath + fileName, code);
          await client.run(code, fileName, wallet, connection, {
            isTest,
          });
        }

        for (const fileName of folder.files) {
          const code = explorer.getFileContent(folderPath + fileName);
          if (!code) continue;

          await client.run(code, fileName, wallet, connection, {
            isTest,
          });
        }
      });
    };

    document.addEventListener(EventName.CLIENT_RUN, handle as EventListener);
    return () => {
      document.removeEventListener(
        EventName.CLIENT_RUN,
        handle as EventListener
      );
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explorer, explorerChanged, connection, wallet, getClient]);

  return <StyledIframe title="test" loading="lazy" />;
};

const StyledIframe = styled.iframe`
  display: none;
`;

export default ClientHelper;