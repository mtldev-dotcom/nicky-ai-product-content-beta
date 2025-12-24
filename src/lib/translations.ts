import { useProductStore, ProductOptionValue } from '@/store/useProductStore';
import { useSettingsStore } from '@/store/useSettingsStore';

const ALL_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
];

/**
 * Translates a single language from English source
 */
async function translateLanguage(
  langCode: string,
  sourceLocalization: any,
  options: any[],
  setTranslatingLanguage: (lang: string, isTranslating: boolean) => void,
  updateLocalization: (lang: string, data: any) => void,
  bulkUpdate: (data: any) => void
): Promise<void> {
  if (langCode === 'en' || !sourceLocalization?.title) {
    return;
  }

  setTranslatingLanguage(langCode, true);
  
  try {
    const langInfo = ALL_LANGUAGES.find(l => l.code === langCode);
    if (!langInfo) return;

    // Filter out "Default" options and values - they should not be translated
    const optionsToTranslate = options.filter(opt => 
      opt.name.toLowerCase() !== 'default' && 
      !opt.values.some((v: ProductOptionValue) => v.value.toLowerCase() === 'default')
    );

    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: sourceLocalization,
        targetLang: langInfo.name,
        selectedLang: langCode,
        options: optionsToTranslate.map(o => ({ 
          name: o.name, 
          translations: o.translations,
          values: o.values.filter((v: ProductOptionValue) => v.value.toLowerCase() !== 'default')
        }))
      }),
    });

    const data = await res.json();
    
    if (res.ok && data.localization) {
      // Update Localization
      updateLocalization(langCode, data.localization);
      
      // Update Options translations, preserving "Default" options
      if (data.options && Array.isArray(data.options)) {
        let translatedIdx = 0;
        const updatedOptions = options.map((opt) => {
          // If this is a "Default" option, keep it as "Default" in all languages
          if (opt.name.toLowerCase() === 'default') {
            return {
              ...opt,
              translations: { ...opt.translations, [langCode]: 'Default' },
              values: opt.values.map((v: ProductOptionValue) => ({
                ...v,
                translations: { 
                  ...v.translations, 
                  [langCode]: v.value.toLowerCase() === 'default' ? 'Default' : v.value 
                }
              }))
            };
          }

          // Get the translated option (skip "Default" options in the response)
          const translatedOpt = data.options[translatedIdx];
          translatedIdx++;

          if (!translatedOpt) return opt;

          const langKey = langCode;
          const optTranslation = translatedOpt.translations?.[langKey] || translatedOpt.name || opt.name;

          // Map values, preserving "Default" values
          let valueIdx = 0;
          const translatedValues = opt.values.map((v: ProductOptionValue) => {
            // If this is a "Default" value, keep it as "Default"
            if (v.value.toLowerCase() === 'default') {
              return {
                ...v,
                translations: { ...v.translations, [langKey]: 'Default' }
              };
            }

            // Get translated value
            const translatedVal = translatedOpt.values?.[valueIdx];
            valueIdx++;
            const valTranslation = translatedVal?.translations?.[langKey] || translatedVal?.value || v.value;
            
            return {
              ...v,
              translations: { ...v.translations, [langKey]: valTranslation }
            };
          });

          return {
            ...opt,
            translations: { ...opt.translations, [langKey]: optTranslation },
            values: translatedValues
          };
        });
        
        bulkUpdate({ options: updatedOptions });
      }
    } else {
      console.error(`Translation failed for ${langCode}:`, data.error);
    }
  } catch (err) {
    console.error(`Translation error for ${langCode}:`, err);
  } finally {
    setTranslatingLanguage(langCode, false);
  }
}

/**
 * Translates all active languages (except English) in the background
 * This is called automatically after content generation or import
 */
export async function translateAllActiveLanguages(): Promise<void> {
  const state = useProductStore.getState();
  const settings = useSettingsStore.getState();
  
  // Get English source content
  const sourceLocalization = state.localization.en;
  if (!sourceLocalization?.title) {
    console.log('No English content available for translation');
    return;
  }

  // Get active languages from settings (organization-level)
  const activeLangs = settings.activeLanguages || ['en'];
  
  // Filter out English and languages that already have content
  const languagesToTranslate = activeLangs.filter(lang => {
    if (lang === 'en') return false;
    const loc = state.localization[lang];
    // Only translate if the language doesn't have a title yet
    return !loc?.title;
  });

  if (languagesToTranslate.length === 0) {
    console.log('No languages need translation');
    return;
  }

  console.log(`Starting background translations for: ${languagesToTranslate.join(', ')}`);

  // Translate all languages in parallel
  // Use allSettled to ensure all translations complete even if some fail
  await Promise.allSettled(
    languagesToTranslate.map(langCode =>
      translateLanguage(
        langCode,
        sourceLocalization,
        state.options,
        state.setTranslatingLanguage,
        state.updateLocalization,
        state.bulkUpdate
      )
    )
  );

  // Save to DB after all translations complete
  try {
    await state.saveToDb();
  } catch (err) {
    console.error('Error saving translations to DB:', err);
  }
}

