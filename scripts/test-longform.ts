import { config } from "dotenv";
config();

import { generateLongformVideo } from "@/lib/longform/longform-generator";

/**
 * Test script: generate a long-form video for Isabel Pantoja
 */
async function main() {
  const backgroundMusicUrls = [
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Evening.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Night%20Vigil.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Late%20Night%20Radio.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Sincerely.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Almost%20Bliss.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Vibing%20Over%20Venus.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Study%20And%20Relax.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Night%20in%20Venice.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Mana%20Two%20-%20Part%202.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Mana%20Two%20-%20Part%201.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Screen%20Saver.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Ether%20Vox.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Ethernight%20Club.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Canon%20In%20D%20Interstellar%20Mix.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Space%20Jazz.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/A%20Very%20Brady%20Special.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Southern%20Gothic.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Mesmerizing%20Galaxy%20Loop.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Gothamlicious.mp3",
    "https://shortsgenerator.fra1.digitaloceanspaces.com/audio/incompetech/Kalimba%20Relaxation%20Music.mp3",
  ];

  const result = await generateLongformVideo({
    userId: "108150207696954569238", // Evgenii
    celebrityName: "Isabel Pantoja",
    context: "Reconstruye la relación con su hija Isa tras años de conflicto",
    ttsVoice: "onyx",
    backgroundMusicUrls,
    backgroundMusicVolume: 0.12, // quiet background
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
    youtubePrivacyStatus: "private", // private for testing
  });

  console.log("\n📊 RESULT:");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });
