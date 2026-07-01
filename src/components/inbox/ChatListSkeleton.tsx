export default function ChatListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="inbox-skel-chat">
          <div className="inbox-skeleton avatar" />
          <div className="lines">
            <div className="inbox-skeleton" />
            <div className="inbox-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}
