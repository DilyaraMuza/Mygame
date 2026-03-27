import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA_saJDVmNph7VHINADqy_DRuzF91J1ez8",
    authDomain: "my-game-350a4.firebaseapp.com",
    projectId: "my-game-350a4",
    storageBucket: "my-game-350a4.firebasestorage.app",
    messagingSenderId: "1037545222875",
    appId: "1:1037545222875:web:52fe99e0a85083546812fe"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Экспортируем функции аутентификации
export const signInWithEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);

// Не создаём свою onAuthStateChanged, а экспортируем ту, что из Firebase
export { onAuthStateChanged };

export async function loadFromFirebase(state) {
    try {
        const userDoc = await getDoc(doc(db, "users", "player"));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            state.designerTheory = userData.designerTheory || 0;
            state.designerPractice = userData.designerPractice || 0;
            state.english = userData.english || 0;
            state.style = userData.style || 0;
            state.coins = userData.coins || 0;
            state.streak = userData.streak || 0;
        }

        const questsSnapshot = await getDocs(collection(db, "quests"));
        state.quests = [];
        questsSnapshot.forEach((doc) => {
            state.quests.push(doc.data());
        });

        console.log('✅ Данные загружены из Firebase');
    } catch (e) {
        console.log('❌ Ошибка загрузки:', e);
    }
}

export async function saveToFirebase(state) {
    try {
        await setDoc(doc(db, "users", "player"), {
            designerTheory: state.designerTheory,
            designerPractice: state.designerPractice,
            english: state.english,
            style: state.style,
            coins: state.coins,
            streak: state.streak
        });

        const questsSnapshot = await getDocs(collection(db, "quests"));
        for (const docSnap of questsSnapshot.docs) {
            await deleteDoc(docSnap.ref);
        }

        for (const quest of state.quests) {
            await setDoc(doc(db, "quests", quest.id.toString()), quest);
        }

        console.log('✅ Все квесты сохранены в Firebase');
    } catch (e) {
        console.log('❌ Ошибка сохранения:', e);
    }
}