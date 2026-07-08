export default function InvalidLicence() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center" style={{ background: '#0C0B25' }}>
      <div className="flex flex-col items-center gap-4 mb-10">
        <img src="./logo.png" alt="MTG Logo" className="w-24 h-24 object-contain opacity-40" />
        <h1 className="text-3xl font-black tracking-tight" style={{ fontFamily: 'Barlow, sans-serif', color: '#C8D300' }}>
          MTG MANAGER
        </h1>
      </div>

      <div className="w-full max-w-md rounded-xl p-8 text-center" style={{ background: '#13122e', border: '1px solid #e05252' }}>
        <div className="text-3xl mb-4">⚠</div>
        <h2 className="text-lg font-bold mb-2" style={{ fontFamily: 'Barlow, sans-serif', color: '#e05252' }}>
          Licence Validation Failed
        </h2>
        <p className="text-sm mb-6" style={{ color: '#7070a0' }}>
          Your licence key could not be validated. This may be because the key has been revoked, or this machine is no longer registered to it.
        </p>
        <p className="text-sm" style={{ color: '#454570' }}>
          Please contact MTG support for assistance.
        </p>
      </div>
    </div>
  )
}
