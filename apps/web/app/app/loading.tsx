export default function AppLoading() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
        <p className="text-sm text-text-secondary">Loading...</p>
      </div>
    </div>
  );
}
