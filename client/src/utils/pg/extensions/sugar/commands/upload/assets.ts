import { Metadata } from "@metaplex-foundation/js";
import * as anchor from "@project-serum/anchor";

import { PgExplorer } from "../../../../explorer";
import { PgModal } from "../../../../modal";
import { PgValidator } from "../../../../validator";
import { CacheItem } from "../../utils";
import { UploadScreen } from "./UploadScreen";

class AssetPair {
  name: string;
  metadata: string;
  metadata_hash: string;
  image: string;
  image_hash: string;
  animation?: string;
  animation_hash?: string;

  constructor(
    name: string,
    metadata: string,
    metadataHash: string,
    image: string,
    imageHash: string,
    animation?: string,
    animationHash?: string
  ) {
    this.name = name;
    this.metadata = metadata;
    this.metadata_hash = metadataHash;
    this.image = image;
    this.image_hash = imageHash;
    this.animation = animation;
    this.animation_hash = animationHash;
  }

  intoCacheItem() {
    return new CacheItem(
      this.name,
      this.image_hash,
      this.image,
      this.metadata_hash,
      this.metadata,
      false,
      this.animation_hash,
      this.animation
    );
  }
}

type GetAssetPairsResult = { assetPairs: [number, AssetPair][]; files: File[] };

const COLLECTION_FILENAME = "collection";

export const getAssetPairs = async (): Promise<GetAssetPairsResult> => {
  const files = await PgModal.set<File[]>(UploadScreen);
  if (!files) throw new Error("You haven't selected files.");

  const fileNames = files.map((f) => f.name);

  const animationExistsRegex = new RegExp(
    /^(.+)\.((mp3)|(mp4)|(mov)|(webm)|(glb))$/
  );

  // Since there doesn't have to be video for each image/json pair, need to get rid of
  // invalid file fileNames before entering metadata filename loop
  for (const fileName in fileNames) {
    const exec = animationExistsRegex.exec(fileName);
    if (exec && exec[1] !== COLLECTION_FILENAME && PgValidator.isInt(exec[1])) {
      throw new Error(
        `Couldn't parse filename '${fileName}' to a valid index number.`
      );
    }
  }

  const metadatafileNames = fileNames.filter((f) =>
    f.toLowerCase().endsWith(".json")
  );
  if (!metadatafileNames.length) {
    throw new Error("Could not find any metadata .json files.");
  }

  ensureSequentialFiles(metadatafileNames);

  const result: GetAssetPairsResult = { assetPairs: [], files };

  for (const metadataFileName of metadatafileNames) {
    const i = metadataFileName.split(".")[0];
    const isCollectionIndex = i === COLLECTION_FILENAME;

    let index;
    if (isCollectionIndex) index = -1;
    else if (PgValidator.isInt(i)) index = parseInt(i);
    else {
      throw new Error(
        `Couldn't parse filename '${metadataFileName}' to a valid index number.,`
      );
    }

    const imgRegex = new RegExp(`^${i}\\.(jpg|jpeg|gif|png)$`, "i");
    const imgFileNames = fileNames.filter((f) => imgRegex.test(f));

    if (imgFileNames.length !== 1) {
      throw new Error(
        isCollectionIndex
          ? "Couldn't find the collection image filename."
          : `Couldn't find an image filename at index ${i}.`
      );
    }

    const imgFileName = imgFileNames[0];
    const imgHash = encode(imgFileName);

    // Need a similar check for animation as above, this one checking if there is animation
    // on specific index
    const animationRegex = new RegExp(`^${i}\\.(mp3|mp4|mov|webm|glb)$`, "i");

    const animationfileNames = fileNames.filter((f) => animationRegex.test(f));
    const animationFileName =
      animationfileNames.length === 1
        ? PgExplorer.joinPaths([
            PgExplorer.PATHS.CANDY_MACHINE_ASSETS_DIR_PATH,
            animationfileNames[0],
          ])
        : undefined;
    const animationHash = animationFileName
      ? encode(animationFileName)
      : undefined;

    const metadataFilePath = PgExplorer.joinPaths([
      PgExplorer.PATHS.CANDY_MACHINE_ASSETS_DIR_PATH,
      metadataFileName,
    ]);
    const metadataHash = encode(metadataFilePath);
    const metadata: Metadata = JSON.parse(
      await files.find((f) => f.name === metadataFileName)!.text()
    );
    const name = metadata.name;

    const imgFilePath = PgExplorer.joinPaths([
      PgExplorer.PATHS.CANDY_MACHINE_ASSETS_DIR_PATH,
      metadataFileName,
    ]);

    result.assetPairs.push([
      index,
      new AssetPair(
        name,
        metadataFileName,
        metadataHash,
        imgFilePath,
        imgHash,
        animationFileName,
        animationHash
      ),
    ]);
  }

  return result;
};

const ensureSequentialFiles = (metadatafileNames: string[]) => {
  metadatafileNames
    .filter((f) => !f.startsWith(COLLECTION_FILENAME))
    .map((f) => {
      const index = f.split(".")[0];
      if (!PgValidator.isInt(index)) {
        throw new Error(
          `Couldn't parse filename '${f}' to a valid index number.`
        );
      }
      return parseInt(index);
    })
    .sort()
    .forEach((f, i) => {
      if (f !== i) {
        throw new Error(`Missing metadata file '${i}.json'`);
      }
    });
};

const encode = (fileName: string) => anchor.utils.sha256.hash(fileName);