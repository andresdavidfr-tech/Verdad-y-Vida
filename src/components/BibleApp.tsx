import React, { useState, useEffect } from 'react';
import { READING_PLAN, getDayOfYear } from '../data/reading-plan';
import { ReadingDay, Mood } from '../types';
import { getMoodVerse } from '../services/gemini';
import { Share2, ExternalLink, CheckCircle2, Sun, LogIn, LogOut, BookOpen, TrendingUp, Settings, UserCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, onSnapshot, collection, serverTimestamp, query, limit, where } from 'firebase/firestore';

export default function BibleApp() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'individual' | 'collaborative'>('individual');
  const [individualDay, setIndividualDay] = useState(1);
  const [collectiveDay, setCollectiveDay] = useState(getDayOfYear());
  const [startDate, setStartDate] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [completedVerses, setCompletedVerses] = useState<Record<string, boolean>>({});
  const [mood, setMood] = useState<Mood | null>(null);
  const [moodVerse, setMoodVerse] = useState<{ verse: string; reference: string; encouragement: string } | null>(null);
  const [loadingMood, setLoadingMood] = useState(false);
  const [prayerSuggestion, setPrayerSuggestion] = useState<string | null>(null);
  const [loadingPrayer, setLoadingPrayer] = useState(false);
  const [favoriteVerse, setFavoriteVerse] = useState('');
  const [favoriteText, setFavoriteText] = useState('');
  const [currentView, setCurrentView] = useState<'lectura' | 'oracion' | 'configuracion' | 'perfil'>('lectura');
  const [history, setHistory] = useState<any[]>([]);

  const showInMobile = (view: string) => currentView === view ? 'block' : 'hidden lg:block';

  const currentDay = activeTab === 'individual' ? READING_PLAN[individualDay - 1] : READING_PLAN[collectiveDay - 1];

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        
        // Load individualDay and startDate
        onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.individualDay) setIndividualDay(data.individualDay);
            if (data.startDate) setStartDate(data.startDate);
          }
        });

        setDoc(userRef, {
          uid: u.uid,
          displayName: u.displayName,
          email: u.email,
          photoURL: u.photoURL,
          lastActive: serverTimestamp()
        }, { merge: true }).catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${u.uid}`));
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync Progress
  useEffect(() => {
    if (!user) return;
    const day = activeTab === 'individual' ? individualDay : collectiveDay;
    const progressId = `${user.uid}_${day}`;
    const progressRef = doc(db, 'progress', progressId);

    const unsubscribe = onSnapshot(progressRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCompletedVerses({
          ot: data.otCompleted || false,
          nt: data.ntCompleted || false
        });
      } else {
        setCompletedVerses({});
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, `progress/${progressId}`));

    return () => unsubscribe();
  }, [user, activeTab, individualDay, collectiveDay]);

  // Sync Favorite
  useEffect(() => {
    if (!user) return;
    const dateStr = new Date().toISOString().split('T')[0];
    const favId = `${user.uid}_${dateStr}`;
    const favRef = doc(db, 'favorites', favId);

    const unsubscribe = onSnapshot(favRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setFavoriteVerse(data.reference || '');
        setFavoriteText(data.text || '');
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, `favorites/${favId}`));

    return () => unsubscribe();
  }, [user]);

  // Sync History
  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    const q = query(collection(db, 'progress'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records: any[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.otCompleted || data.ntCompleted) {
          records.push({
            day: data.day,
            otCompleted: data.otCompleted,
            ntCompleted: data.ntCompleted,
            updatedAt: data.updatedAt
          });
        }
      });
      records.sort((a, b) => b.day - a.day);
      setHistory(records);
    }, (e) => handleFirestoreError(e, OperationType.GET, 'progress'));

    return () => unsubscribe();
  }, [user]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login error", error);
    }
  };

  const logout = () => signOut(auth);

  const getPrayer = async () => {
    setLoadingPrayer(true);
    try {
      const { getPrayerEncouragement } = await import('../services/gemini');
      const data = await getPrayerEncouragement(`${currentDay.ot}, ${currentDay.nt}`);
      setPrayerSuggestion(data.suggestion);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingPrayer(false);
    }
  };

  const handleMoodSelect = async (selectedMood: Mood) => {
    setMood(selectedMood);
    setLoadingMood(true);
    try {
      const data = await getMoodVerse(selectedMood);
      setMoodVerse(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingMood(false);
    }
  };

  const toggleVerse = async (id: 'ot' | 'nt') => {
    const newCompleted = { ...completedVerses, [id]: !completedVerses[id] };
    setCompletedVerses(newCompleted);

    if (!user) return;

    const day = activeTab === 'individual' ? individualDay : collectiveDay;
    const progressId = `${user.uid}_${day}`;
    const progressRef = doc(db, 'progress', progressId);
    
    try {
      await setDoc(progressRef, {
        uid: user.uid,
        day,
        otCompleted: !!newCompleted.ot,
        ntCompleted: !!newCompleted.nt,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `progress/${progressId}`);
    }
  };

  const saveFavorite = async () => {
    if (!user) return;
    const dateStr = new Date().toISOString().split('T')[0];
    const favId = `${user.uid}_${dateStr}`;
    const favRef = doc(db, 'favorites', favId);

    try {
      await setDoc(favRef, {
        uid: user.uid,
        date: dateStr,
        reference: favoriteVerse,
        text: favoriteText,
        createdAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `favorites/${favId}`);
    }
  };

  const shareOnWhatsApp = () => {
    saveFavorite();
    const text = `📖 Mi versículo destacado de hoy (${currentDay.ot}, ${currentDay.nt}):\n\n"${favoriteText}"\n\n${favoriteVerse}\n\nLeamos juntos en Verdad y Vida.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const updateIndividualDay = async (newDay: number) => {
    setIndividualDay(newDay);
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    try {
      await setDoc(userRef, { individualDay: newDay }, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const handleSetStartDate = async (date: string) => {
    setStartDate(date);
    setShowDatePicker(false);
    
    // Calculate current day based on start date
    const start = new Date(date);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const newDay = Math.min(728, Math.max(1, diffDays + 1));
    
    updateIndividualDay(newDay);
    
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    try {
      await setDoc(userRef, { startDate: date }, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const progress = (Object.values(completedVerses).filter(Boolean).length / 2) * 100;

  return (
    <div className="min-h-screen bg-bg-light font-sans text-text-main flex flex-col">
      {/* Header */}
      <header className="bg-secondary-blue text-white p-6 border-b-4 border-accent-yellow shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            className="logo-area flex items-center gap-3 cursor-pointer"
          >
            <div className="w-10 h-10 bg-accent-yellow rounded-full flex items-center justify-center text-secondary-blue font-bold shadow-inner">VV</div>
            <h1 className="text-xl font-serif tracking-wider uppercase">Verdad y Vida</h1>
          </motion.div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:block text-sm opacity-80 font-medium">
              {new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}
            </div>
            {user ? (
              <div className="hidden lg:flex items-center gap-3">
                <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border-2 border-accent-yellow shadow-sm" />
                <button onClick={logout} className="text-xs opacity-70 hover:opacity-100 flex items-center gap-1 transition-opacity">
                  <LogOut size={14} /> Salir
                </button>
              </div>
            ) : (
              <button onClick={login} className="hidden lg:flex bg-accent-yellow text-secondary-blue px-4 py-2 rounded-lg text-sm font-bold items-center gap-2 hover:bg-highlight transition-all shadow-md active:scale-95">
                <LogIn size={16} /> Iniciar Sesión
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-[280px_1fr_300px] gap-6 flex-1 pb-24 lg:pb-6">
        {/* Left Sidebar */}
        <aside className="space-y-6 flex flex-col">
          <div className={cn("bg-white rounded-2xl p-6 border border-border-color shadow-sm", showInMobile('configuracion'))}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary-green border-b border-bg-light pb-2 mb-4">Información del Plan</h3>
            <p className="text-xs text-text-muted leading-relaxed mb-4">
              Este es un plan de lectura bíblica de <strong>dos años</strong>, diseñado para profundizar en la Palabra de manera constante.
            </p>
            <div className="bg-bg-light p-4 rounded-xl border border-border-color">
              <p className="text-[11px] text-secondary-blue italic font-medium">
                <strong>Recomendación:</strong> Te sugerimos leer las excelentes notas de la <strong>Biblia Versión Recobro</strong>.
              </p>
              <div className="flex flex-col gap-2 mt-3">
                <a 
                  href="https://apps.apple.com/ar/app/santa-biblia-versi%C3%B3n-recobro/id1587426230?l=en-GB" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[10px] bg-secondary-blue text-white px-3 py-2 rounded-lg flex items-center justify-center gap-1 hover:bg-secondary-blue/90 transition-colors shadow-sm"
                >
                  App Store <ExternalLink size={10} />
                </a>
                <a 
                  href="https://play.google.com/store/apps/details?id=com.sparcv.lsm&pcampaignid=web_share" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[10px] bg-secondary-blue text-white px-3 py-2 rounded-lg flex items-center justify-center gap-1 hover:bg-secondary-blue/90 transition-colors shadow-sm"
                >
                  Google Play <ExternalLink size={10} />
                </a>
              </div>
            </div>
          </div>

          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn("bg-white rounded-2xl p-6 border border-border-color shadow-sm", showInMobile('lectura'))}
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary-green border-b border-bg-light pb-2 mb-4">Planes de Lectura</h3>
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => setActiveTab('individual')}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl border transition-all text-sm font-medium",
                  activeTab === 'individual' 
                    ? "bg-primary-green text-white border-primary-green shadow-lg scale-[1.02]" 
                    : "bg-bg-light text-text-main border-border-color hover:border-primary-green/30"
                )}
              >
                Plan de lectura personal (comienza desde el principio)
              </button>
              <button 
                onClick={() => setActiveTab('collaborative')}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl border transition-all text-sm font-medium",
                  activeTab === 'collaborative' 
                    ? "bg-primary-green text-white border-primary-green shadow-lg scale-[1.02]" 
                    : "bg-bg-light text-text-main border-border-color hover:border-primary-green/30"
                )}
              >
                Plan de lectura Colectivo (sigue con otros la lectura del año calendario)
              </button>
            </div>
          </motion.div>

          {activeTab === 'individual' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className={cn("bg-white rounded-2xl p-6 border border-border-color shadow-sm overflow-hidden", showInMobile('configuracion'))}
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary-green border-b border-bg-light pb-2 mb-4">Inicio de Lectura</h3>
              <p className="text-[11px] text-text-muted mb-3">Comenzaste a leer el:</p>
              {!showDatePicker ? (
                <button 
                  onClick={() => setShowDatePicker(true)}
                  className="w-full py-2 px-3 bg-bg-light border border-border-color rounded-lg text-xs text-secondary-blue hover:bg-accent-yellow/10 transition-colors flex items-center justify-between"
                >
                  <span>{startDate ? new Date(startDate).toLocaleDateString() : 'Seleccionar fecha'}</span>
                  <ExternalLink size={12} />
                </button>
              ) : (
                <div className="space-y-2">
                  <input 
                    type="date" 
                    className="w-full p-2 border border-border-color rounded-lg text-xs outline-none focus:ring-1 focus:ring-accent-yellow"
                    onChange={(e) => handleSetStartDate(e.target.value)}
                    value={startDate || ''}
                  />
                  <button 
                    onClick={() => setShowDatePicker(false)}
                    className="text-[10px] text-text-muted hover:text-primary-green underline"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </motion.div>
          )}

          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className={cn("bg-white rounded-2xl p-4 border border-border-color shadow-sm", showInMobile('perfil'))}
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary-green border-b border-bg-light pb-2 mb-3">¿Cómo te sientes hoy?</h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {(['Agradecido', 'Necesitado', 'Gozoso', 'Triste', 'Cansado', 'Buscando'] as Mood[]).map((m, idx) => {
                return (
                  <motion.button
                    key={m}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleMoodSelect(m)}
                    className={cn(
                      "flex items-center justify-center text-xs font-medium rounded-xl border transition-all shadow-sm py-3 px-1 text-center",
                      mood === m 
                        ? "bg-primary-green border-primary-green text-white shadow-inner" 
                        : "bg-white border-border-color hover:bg-bg-light text-text-main"
                    )}
                    title={m}
                  >
                    {m}
                  </motion.button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              {loadingMood && (
                <div className="text-xs text-accent-yellow italic animate-pulse">Buscando una palabra...</div>
              )}
              {moodVerse && !loadingMood && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="bg-accent-yellow/10 p-4 rounded-xl border border-accent-yellow/20 text-base leading-relaxed text-secondary-blue"
                >
                  <strong className="block mb-1 text-sm">Un versículo pensado para ti:</strong> "{moodVerse.verse}" <span className="text-sm font-bold">({moodVerse.reference})</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Mobile Profile Extra: Login/Logout */}
          <div className={cn("bg-white rounded-2xl p-6 border border-border-color shadow-sm lg:hidden", showInMobile('perfil'))}>
             <h3 className="text-xs font-bold uppercase tracking-wider text-primary-green border-b border-bg-light pb-2 mb-4">Mi Cuenta</h3>
             {user ? (
                <div className="flex flex-col items-center gap-4">
                  <img src={user.photoURL || ''} alt="" className="w-16 h-16 rounded-full border-4 border-accent-yellow shadow-sm" />
                  <div className="text-center">
                    <p className="font-bold text-secondary-blue">{user.displayName}</p>
                    <p className="text-xs text-text-muted">{user.email}</p>
                  </div>
                  <button onClick={logout} className="w-full mt-2 bg-bg-light text-secondary-blue px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-gray-100 transition-all shadow-sm">
                    <LogOut size={16} /> Cerrar Sesión
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-text-muted mb-4">Inicia sesión para guardar tu progreso y sincronizar tus datos.</p>
                  <button onClick={login} className="w-full bg-accent-yellow text-secondary-blue px-4 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 hover:bg-highlight transition-all shadow-md">
                    <LogIn size={18} /> Iniciar Sesión
                  </button>
                </div>
              )}
          </div>

          {/* History Section */}
          <div className={cn("bg-white rounded-2xl p-6 border border-border-color shadow-sm", showInMobile('perfil'))}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary-green border-b border-bg-light pb-2 mb-4">Historial de Lectura</h3>
            {!user ? (
              <p className="text-xs text-text-muted">Inicia sesión para ver tu historial.</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-text-muted">Aún no hay lecturas completadas.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-3 pr-2">
                {history.map(record => {
                  const planDay = READING_PLAN[record.day - 1];
                  if (!planDay) return null;
                  return (
                    <div key={record.day} className="bg-bg-light p-3 rounded-xl border border-border-color text-sm">
                      <div className="font-bold text-secondary-blue mb-1">Día {record.day}</div>
                      {record.otCompleted && <div className="text-xs text-text-main flex items-center gap-1 mt-1"><CheckCircle2 size={12} className="text-primary-green min-w-[12px]"/> <span>{planDay.ot}</span></div>}
                      {record.ntCompleted && <div className="text-xs text-text-main flex items-center gap-1 mt-1"><CheckCircle2 size={12} className="text-primary-green min-w-[12px]"/> <span>{planDay.nt}</span></div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Center Content: Reading Area */}
        <div className="space-y-6">
          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("bg-white rounded-3xl p-8 border border-border-color shadow-xl relative", showInMobile('lectura'))}
          >
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-4">
                <h2 className="text-3xl font-serif text-secondary-blue font-bold">
                  Día {activeTab === 'individual' ? individualDay : collectiveDay}
                </h2>
                {activeTab === 'individual' && (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => updateIndividualDay(Math.max(1, individualDay - 1))}
                      className="p-2 rounded-full hover:bg-bg-light text-secondary-blue transition-colors border border-border-color shadow-sm"
                      title="Día anterior"
                    >
                      <motion.div whileTap={{ scale: 0.8 }}>←</motion.div>
                    </button>
                    <button 
                      onClick={() => updateIndividualDay(Math.min(728, individualDay + 1))}
                      className="p-2 rounded-full hover:bg-bg-light text-secondary-blue transition-colors border border-border-color shadow-sm"
                      title="Día siguiente"
                    >
                      <motion.div whileTap={{ scale: 0.8 }}>→</motion.div>
                    </button>
                  </div>
                )}
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-primary-green uppercase tracking-widest bg-primary-green/10 px-3 py-1 rounded-full">Progreso de hoy</span>
              </div>
            </div>

            <div className="grid gap-8">
              <div className="space-y-6">
                <motion.div 
                  whileHover={{ x: 5 }}
                  className="flex items-center gap-4 cursor-pointer group p-4 rounded-2xl hover:bg-bg-light/50 transition-all border border-transparent hover:border-border-color"
                  onClick={() => toggleVerse('ot')}
                >
                  <CheckCircle2 
                    className={cn("w-8 h-8 transition-colors", completedVerses['ot'] ? "text-primary-green" : "text-gray-200 group-hover:text-gray-300")} 
                  />
                  <h4 className={cn("font-serif text-2xl transition-all", completedVerses['ot'] ? "text-primary-green font-bold" : "text-text-main")}>{currentDay.ot}</h4>
                </motion.div>
                <motion.div 
                  whileHover={{ x: 5 }}
                  className="flex items-center gap-4 cursor-pointer group p-4 rounded-2xl hover:bg-bg-light/50 transition-all border border-transparent hover:border-border-color"
                  onClick={() => toggleVerse('nt')}
                >
                  <CheckCircle2 
                    className={cn("w-8 h-8 transition-colors", completedVerses['nt'] ? "text-primary-green" : "text-gray-200 group-hover:text-gray-300")} 
                  />
                  <h4 className={cn("font-serif text-2xl transition-all", completedVerses['nt'] ? "text-primary-green font-bold" : "text-text-main")}>{currentDay.nt}</h4>
                </motion.div>
              </div>

              <div className="bible-text pt-8 border-t border-border-color italic text-text-muted text-lg text-center font-serif">
                "La palabra de Cristo more en abundancia en vosotros..." (Col. 3:16)
              </div>
            </div>

            <div className="mt-12">
              <div className="h-4 bg-bg-light rounded-full overflow-hidden border border-border-color p-1">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="h-full bg-gradient-to-r from-primary-green to-accent-yellow rounded-full shadow-sm"
                />
              </div>
              <p className="text-xs mt-3 text-right text-text-muted font-medium">
                {Math.round(progress)}% completado ({Object.values(completedVerses).filter(Boolean).length} de 2 porciones)
              </p>
            </div>
          </motion.section>

          <motion.section 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("bg-white rounded-3xl p-8 border border-border-color shadow-xl relative", showInMobile('oracion'))}
          >
            {/* Prayer Callout */}
            <motion.div 
              whileHover={{ scale: 1.01 }}
              className="bg-secondary-blue text-white p-8 rounded-3xl italic text-sm leading-relaxed shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent-yellow/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
              <div className="flex items-center gap-2 mb-3 not-italic font-bold text-accent-yellow text-lg">
                <Sun size={20} />
                <span>Tiempo de Oración</span>
              </div>
              <p className="mb-6 text-white/90 text-base">Te animamos a tomar los versículos leídos hoy para orar al Señor. Deja que Su palabra more en abundancia.</p>
              
              <button 
                onClick={getPrayer}
                disabled={loadingPrayer}
                className="w-full bg-white/10 hover:bg-white/20 text-white py-3 rounded-xl border border-white/20 transition-all text-sm font-bold disabled:opacity-50 shadow-lg active:scale-95"
              >
                {loadingPrayer ? 'Buscando sugerencia...' : 'Obtener sugerencia de oración'}
              </button>
              
              <AnimatePresence>
                {prayerSuggestion && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-6 bg-white/10 p-4 rounded-xl text-sm border-l-4 border-accent-yellow text-white/95 leading-relaxed"
                  >
                    {prayerSuggestion}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.section>
        </div>

        {/* Right Sidebar: Action Panel */}
        <aside className="space-y-6 flex flex-col">
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn("bg-white rounded-2xl p-6 border border-border-color shadow-sm border-t-4 border-t-accent-yellow", showInMobile('lectura'))}
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary-green mb-1">Mi versículo destacado</h3>
            <p className="text-[10px] text-text-muted mb-4">Escribe el Rhema de hoy para compartirlo.</p>
            
            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="Cita (ej. Juan 3:16)"
                value={favoriteVerse}
                onChange={(e) => setFavoriteVerse(e.target.value)}
                onBlur={saveFavorite}
                className="w-full p-3 rounded-xl bg-bg-light border border-border-color focus:ring-2 focus:ring-accent-yellow/50 outline-none text-sm transition-all"
              />
              <textarea 
                placeholder="Escribe aquí el versículo que tocó tu corazón..."
                value={favoriteText}
                onChange={(e) => setFavoriteText(e.target.value)}
                onBlur={saveFavorite}
                className="w-full p-3 rounded-xl bg-bg-light border border-border-color focus:ring-2 focus:ring-accent-yellow/50 outline-none text-sm h-32 transition-all resize-none"
              />
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={shareOnWhatsApp}
                disabled={!favoriteVerse || !favoriteText}
                className="w-full bg-[#25D366] hover:bg-[#20bd5c] text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg disabled:opacity-50 text-sm"
              >
                <Share2 size={18} />
                Compartir por WhatsApp
              </motion.button>
            </div>
          </motion.div>
          
          <div className={cn("text-center p-4 border-t border-border-color mt-auto", showInMobile('configuracion'))}>
            <p className="text-[10px] text-text-muted mb-2 uppercase tracking-widest font-bold leading-relaxed">Links recomendados para obtener más luz y revelación de las sagradas escrituras</p>
            <a 
              href="https://www.librosdelministerio.org" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-primary-green font-bold hover:underline flex items-center justify-center gap-1 transition-all"
            >
              librosdelministerio.org
              <ExternalLink size={10} />
            </a>
          </div>
        </aside>
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="lg:hidden fixed bottom-0 left-0 w-full bg-white border-t border-border-color shadow-[0_-10px_40px_rgba(0,0,0,0.08)] z-50 pb-safe">
        <div className="flex justify-around items-center p-2">
          <button onClick={() => setCurrentView('lectura')} className={cn("flex flex-col items-center p-2 rounded-xl transition-all", currentView === 'lectura' ? "text-primary-green" : "text-text-muted hover:text-secondary-blue")}>
            <BookOpen size={24} className={cn("mb-1 transition-transform", currentView === 'lectura' && "scale-110")} />
            <span className="text-[10px] font-bold">Lectura</span>
          </button>
          <button onClick={() => setCurrentView('oracion')} className={cn("flex flex-col items-center p-2 rounded-xl transition-all", currentView === 'oracion' ? "text-primary-green" : "text-text-muted hover:text-secondary-blue")}>
            <Sun size={24} className={cn("mb-1 transition-transform", currentView === 'oracion' && "scale-110")} />
            <span className="text-[10px] font-bold">Oración</span>
          </button>
          <button onClick={() => setCurrentView('configuracion')} className={cn("flex flex-col items-center p-2 rounded-xl transition-all", currentView === 'configuracion' ? "text-primary-green" : "text-text-muted hover:text-secondary-blue")}>
            <Settings size={24} className={cn("mb-1 transition-transform", currentView === 'configuracion' && "scale-110")} />
            <span className="text-[10px] font-bold">Configuración</span>
          </button>
          <button onClick={() => setCurrentView('perfil')} className={cn("flex flex-col items-center p-2 rounded-xl transition-all", currentView === 'perfil' ? "text-primary-green" : "text-text-muted hover:text-secondary-blue")}>
            <UserCircle size={24} className={cn("mb-1 transition-transform", currentView === 'perfil' && "scale-110")} />
            <span className="text-[10px] font-bold">Perfil</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
