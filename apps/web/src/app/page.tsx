import Image from "next/image";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-black px-6 text-center font-sans">
      <Image
        className="mb-2 rounded-3xl shadow-[0_0_40px_rgba(99,102,241,0.35)]"
        src="/origin-logo.png"
        alt="Origin logo"
        width={96}
        height={96}
        priority
      />
      <h1 className="text-5xl font-semibold tracking-widest text-zinc-50 sm:text-7xl">
        ORIGIN
      </h1>
      <p className="text-lg text-zinc-400 sm:text-xl">
        One voice. One assistant. Your digital life.
      </p>
    </main>
  );
}
