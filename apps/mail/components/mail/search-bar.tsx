import { matchFilterPrefix, filterSuggestionsFunction, filterSuggestions } from '@/lib/filter';
import { cn, extractFilterValue, type FilterSuggestion } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, CalendarIcon, X } from 'lucide-react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchValue } from '@/hooks/use-search-value';
import { Calendar } from '@/components/ui/calendar';
import { type DateRange } from 'react-day-picker';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { format } from 'date-fns';
import React from 'react';
import { enhanceSearchQuery } from '@/actions/ai-search';

const SEARCH_SUGGESTIONS = [
  '"Emails from last week..."',
  '"Emails with attachments..."',
  '"Unread emails..."',
  '"Emails from Caroline and Josh..."',
  '"Starred emails..."',
  '"Emails with links..."',
  '"Emails from last month..."',
];

// function DateFilter({ date, setDate }: { date: DateRange; setDate: (date: DateRange) => void }) {
//   const t = useTranslations('common.searchBar');

//   return (
//     <div className="grid gap-2">
//       <Popover>
//         <PopoverTrigger asChild>
//           <Button
//             id="date"
//             variant={'outline'}
//             className={cn(
//               'justify-start text-left font-normal',
//               !date && 'text-muted-foreground',
//               'bg-muted/50 h-10 rounded-md',
//             )}
//           >
//             <CalendarIcon className="mr-2 h-4 w-4" />
//             {date?.from ? (
//               date.to ? (
//                 <>
//                   {format(date.from, 'LLL dd, y')} - {format(date.to, 'LLL dd, y')}
//                 </>
//               ) : (
//                 format(date.from, 'LLL dd, y')
//               )
//             ) : (
//               <span>{t('pickDateRange')}</span>
//             )}
//           </Button>
//         </PopoverTrigger>
//         <PopoverContent className="w-auto rounded-md p-0" align="start">
//           <Calendar
//             initialFocus
//             mode="range"
//             defaultMonth={date?.from}
//             selected={date}
//             onSelect={(range) => range && setDate(range)}
//             numberOfMonths={useIsMobile() ? 1 : 2}
//             disabled={(date) => date > new Date()}
//           />
//         </PopoverContent>
//       </Popover>
//     </div>
//   );
// }

type SearchForm = {
  subject: string;
  from: string;
  to: string;
  q: string;
  dateRange: DateRange;
  category: string;
  folder: string;
};

export function SearchBar() {
  // const [popoverOpen, setPopoverOpen] = useState(false);
  const [, setSearchValue] = useSearchValue();
  const [isSearching, setIsSearching] = useState(false);
  const [isAISearching, setIsAISearching] = useState(false);
  const [value, setValue] = useState<SearchForm>({
    folder: '',
    subject: '',
    from: '',
    to: '',
    q: '',
    dateRange: {
      from: undefined,
      to: undefined,
    },
    category: '',
  });

  const t = useTranslations();

  const [suggestionsState, setSuggestionsState] = useState({
    show: false,
    filtered: [] as FilterSuggestion[],
    activeIndex: 0,
    activePrefix: null as string | null,
  });

  const [datePickerState, setDatePickerState] = useState({
    show: false,
    filterType: null as 'after' | 'before' | null,
    position: { left: 0, top: 0 },
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const form = useForm<SearchForm>({
    defaultValues: value,
  });

  const formValues = useMemo(
    () => ({
      q: form.watch('q'),
    }),
    [form.watch('q')],
  );

  const filtering = useMemo(
    () =>
      value.q.length > 0 ||
      value.from.length > 0 ||
      value.to.length > 0 ||
      value.dateRange.from ||
      value.dateRange.to ||
      value.category ||
      value.folder,
    [value],
  );

  const [isFocused, setIsFocused] = useState(false);
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const suggestionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isFocused && !formValues.q) {
      suggestionIntervalRef.current = setInterval(() => {
        setIsAnimating(true);
        setTimeout(() => {
          setCurrentSuggestionIndex((prev) => (prev + 1) % SEARCH_SUGGESTIONS.length);
          setIsAnimating(false);
        }, 300);
      }, 3000);
    } else {
      if (suggestionIntervalRef.current) {
        clearInterval(suggestionIntervalRef.current);
      }
    }

    return () => {
      if (suggestionIntervalRef.current) {
        clearInterval(suggestionIntervalRef.current);
      }
    };
  }, [isFocused, formValues.q]);

  const submitSearch = useCallback(
    async (data: SearchForm) => {
      setIsSearching(true);
      let searchTerms = [];

      try {
        // Only enhance the query if there's a search term
        if (data.q.trim()) {
          setIsAISearching(true);
          const { enhancedQuery, error } = await enhanceSearchQuery(data.q.trim());
          setIsAISearching(false);
          
          if (error) {
            console.error('AI enhancement error:', error);
            // Fallback to original query if AI enhancement fails
            searchTerms.push(data.q.trim());
          } else {
            searchTerms.push(enhancedQuery);
          }
        }

        // Add any additional filters
        if (data.from) searchTerms.push(`from:${data.from.toLowerCase()}`);
        if (data.to) searchTerms.push(`to:${data.to.toLowerCase()}`);
        if (data.subject) searchTerms.push(`subject:(${data.subject})`);
        if (data.dateRange.from)
          searchTerms.push(`after:${format(data.dateRange.from, 'yyyy/MM/dd')}`);
        if (data.dateRange.to) 
          searchTerms.push(`before:${format(data.dateRange.to, 'yyyy/MM/dd')}`);

        const searchQuery = searchTerms.join(' ');
        const folder = data.folder ? data.folder.toUpperCase() : '';

        console.log('Final search query:', searchQuery);
        
        setSearchValue({
          value: searchQuery,
          highlight: data.q,
          folder: folder,
          isLoading: true,
          isAISearching: isAISearching
        });

      } catch (error) {
        console.error('Search error:', error);
        // Fallback to regular search if AI fails
        if (data.q) {
          searchTerms.push(data.q.trim());
        }
        const searchQuery = searchTerms.join(' ');
        const folder = data.folder ? data.folder.toUpperCase() : '';
        setSearchValue({
          value: searchQuery,
          highlight: data.q,
          folder: folder,
          isLoading: true,
          isAISearching: false
        });
      } finally {
        setIsSearching(false);
      }
    },
    [setSearchValue, isAISearching],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      
      if (!inputValue.trim()) {
        setSuggestionsState((prev) => ({ ...prev, show: false }));
        setDatePickerState((prev) => ({ ...prev, show: false }));
        form.setValue('q', '');
        resetSearch();
        return;
      }

      const cursorPosition = e.target.selectionStart || 0;

      const textBeforeCursor = inputValue.substring(0, cursorPosition);

      const match = matchFilterPrefix(textBeforeCursor);

      if (match) {
        const [, prefix, query] = match;
        const suggestions = filterSuggestionsFunction(filterSuggestions, prefix, query);

        if (prefix === 'after' || prefix === 'before') {
          setDatePickerState((prev) => ({
            ...prev,
            filterType: prefix as 'after' | 'before',
          }));

          const inputEl = inputRef.current;
          if (inputEl) {
            const span = document.createElement('span');
            span.style.visibility = 'hidden';
            span.style.position = 'absolute';
            span.style.whiteSpace = 'pre';
            span.style.font = window.getComputedStyle(inputEl).font;
            span.textContent = textBeforeCursor;
            document.body.appendChild(span);

            const rect = inputEl.getBoundingClientRect();
            const spanWidth = span.getBoundingClientRect().width;

            document.body.removeChild(span);

            setDatePickerState((prev) => ({
              ...prev,
              position: {
                left: Math.min(spanWidth, rect.width - 320),
                top: rect.height,
              },
            }));
          }
        }

        setSuggestionsState({
          show: true,
          filtered: suggestions,
          activeIndex: 0,
          activePrefix: prefix,
        });
      } else {
        setSuggestionsState((prev) => ({ ...prev, show: false, activePrefix: null }));
        setDatePickerState((prev) => ({ ...prev, show: false, filterType: null }));
      }

      form.setValue('q', inputValue);
    },
    [form],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!suggestionsState.show) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          setSuggestionsState((prev) => ({
            ...prev,
            activeIndex: prev.activeIndex > 0 ? prev.activeIndex - 1 : prev.filtered.length - 1,
          }));
        } else {
          setSuggestionsState((prev) => ({
            ...prev,
            activeIndex: prev.activeIndex < prev.filtered.length - 1 ? prev.activeIndex + 1 : 0,
          }));
        }
        return;
      }

      const handleArrowNavigation = (direction: 'right' | 'left' | 'down' | 'up') => {
        e.preventDefault();
        const containerWidth = 600;
        const buttonWidth = isMobile ? 80 : 100;
        const gap = 12;
        const columns = Math.floor((containerWidth + gap) / (buttonWidth + gap));

        setSuggestionsState((prev) => {
          let nextIndex = prev.activeIndex;

          switch (direction) {
            case 'right':
              nextIndex =
                prev.activeIndex < prev.filtered.length - 1
                  ? prev.activeIndex + 1
                  : prev.activeIndex;
              break;
            case 'left':
              nextIndex = prev.activeIndex > 0 ? prev.activeIndex - 1 : 0;
              break;
            case 'down':
              nextIndex = prev.activeIndex + columns;
              nextIndex = nextIndex < prev.filtered.length ? nextIndex : prev.activeIndex;
              break;
            case 'up':
              nextIndex = prev.activeIndex - columns;
              nextIndex = nextIndex >= 0 ? nextIndex : prev.activeIndex;
              break;
          }

          return { ...prev, activeIndex: nextIndex };
        });
      };

      if (e.key === 'ArrowRight') handleArrowNavigation('right');
      else if (e.key === 'ArrowLeft') handleArrowNavigation('left');
      else if (e.key === 'ArrowDown') handleArrowNavigation('down');
      else if (e.key === 'ArrowUp') handleArrowNavigation('up');

      if (e.key === 'Enter' && suggestionsState.show) {
        e.preventDefault();
        const suggestion = suggestionsState.filtered?.[suggestionsState.activeIndex];
        if (suggestion) {
          handleSuggestionClick(suggestion.filter);
        }
        return;
      }

      if (e.key === 'Escape') {
        setSuggestionsState((prev) => ({ ...prev, show: false }));
      }
    },
    [suggestionsState, isMobile],
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setSuggestionsState((prev) => ({ ...prev, show: false }));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      const inputValue = form.getValues().q || '';
      const cursorPosition = inputRef.current?.selectionStart || 0;

      const textBeforeCursor = inputValue.substring(0, cursorPosition);
      const textAfterCursor = inputValue.substring(cursorPosition);

      const match = matchFilterPrefix(textBeforeCursor);

      if (match) {
        const [fullMatch] = match;
        const startPos = textBeforeCursor.lastIndexOf(fullMatch);

        if ((match[1] === 'after' || match[1] === 'before') && suggestion.endsWith('date')) {
          setDatePickerState((prev) => ({ ...prev, show: true }));
          setSuggestionsState((prev) => ({ ...prev, show: false }));
          return;
        }

        const newValue = inputValue.substring(0, startPos) + suggestion + ' ' + textAfterCursor;

        form.setValue('q', newValue);

        submitSearch({
          ...form.getValues(),
          q: newValue,
        });
      }

      setSuggestionsState((prev) => ({ ...prev, show: false }));
      inputRef.current?.focus();
    },
    [form, submitSearch],
  );

  const handleDateSelect = useCallback(
    (dateRange: DateRange | undefined) => {
      if (!dateRange || !datePickerState.filterType) return;

      let filterText = '';

      if (datePickerState.filterType === 'after' && dateRange.from) {
        const formattedDate = format(dateRange.from, 'yyyy/MM/dd');
        filterText = `after:${formattedDate}`;

        if (dateRange.to) {
          const formattedEndDate = format(dateRange.to, 'yyyy/MM/dd');
          filterText += ` before:${formattedEndDate}`;
        }
      } else if (datePickerState.filterType === 'before' && dateRange.to) {
        const formattedDate = format(dateRange.to, 'yyyy/MM/dd');
        filterText = `before:${formattedDate}`;

        if (dateRange.from) {
          const formattedStartDate = format(dateRange.from, 'yyyy/MM/dd');
          filterText = `after:${formattedStartDate} before:${formattedDate}`;
        }
      }

      if (!filterText) return;

      const inputValue = form.getValues().q || '';
      const cursorPosition = inputRef.current?.selectionStart || 0;

      const textBeforeCursor = inputValue.substring(0, cursorPosition);
      const textAfterCursor = inputValue.substring(cursorPosition);

      const match = matchFilterPrefix(textBeforeCursor);

      if (match) {
        const [fullMatch] = match;
        const startPos = textBeforeCursor.lastIndexOf(fullMatch);
        const newValue = inputValue.substring(0, startPos) + filterText + ' ' + textAfterCursor;

        form.setValue('q', newValue);

        submitSearch({
          ...form.getValues(),
          q: newValue,
        });
      }

      setDatePickerState((prev) => ({ ...prev, show: false }));
      inputRef.current?.focus();
    },
    [datePickerState.filterType, form, submitSearch],
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        datePickerRef.current &&
        !datePickerRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setDatePickerState((prev) => ({ ...prev, show: false }));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const renderSuggestions = useCallback(() => {
    const { show, filtered = [] } = suggestionsState;
    if (!show || filtered.length === 0) return null;

    return (
      <div
        className="border-border bg-background animate-in fade-in-50 slide-in-from-top-2 absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border shadow-md duration-150"
        role="listbox"
        aria-label="Search filter suggestions"
        style={{
          maxWidth: isMobile ? 'calc(100vw - 24px)' : '600px',
          maxHeight: isMobile ? '50vh' : '400px',
        }}
      >
        <div className="p-3">
          {suggestionsState.activePrefix && (
            <div className="mb-2 px-1">
              <div className="text-muted-foreground text-xs">
                <span className="font-medium">{suggestionsState.activePrefix}:</span> filters
              </div>
            </div>
          )}

          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? '80px' : '100px'}, 1fr))`,
              maxHeight: '300px',
              overflowY: 'auto',
            }}
          >
            {filtered.map((suggestion, index) => {
              const value = extractFilterValue(suggestion.filter);
              const isEmailFilter = suggestion.prefix === 'from' || suggestion.prefix === 'to';

              return (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion.filter)}
                  role="option"
                  aria-selected={index === suggestionsState.activeIndex}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1.5 rounded-md px-2 py-3 transition-all',
                    'hover:border-accent/30 focus-visible:ring-ring border focus:outline-none focus-visible:ring-2',
                    'h-[80px]',
                    index === suggestionsState.activeIndex
                      ? 'bg-accent/15 border-accent/30 text-accent-foreground'
                      : 'hover:bg-muted/50 border-transparent',
                  )}
                  onMouseEnter={() =>
                    !isMobile && setSuggestionsState((prev) => ({ ...prev, activeIndex: index }))
                  }
                  title={suggestion.description}
                >
                  <div className="text-foreground flex h-6 w-6 items-center justify-center">
                    {suggestion.icon}
                  </div>

                  <div
                    className={cn(
                      'w-full truncate text-center text-xs',
                      isEmailFilter ? '' : 'capitalize',
                    )}
                  >
                    {isEmailFilter ? value.toLowerCase() : value}
                  </div>
                </button>
              );
            })}
          </div>

          {!isMobile && filtered.length > 1 && (
            <div className="text-muted-foreground border-border/15 mt-2 border-t pt-2 text-center text-[9px]">
              <kbd className="border-border/30 rounded border px-1 text-[9px]">↹</kbd> to navigate •
              <kbd className="border-border/30 ml-1 rounded border px-1 text-[9px]">↵</kbd> to
              select
            </div>
          )}
        </div>
      </div>
    );
  }, [suggestionsState, isMobile, handleSuggestionClick]);

  const renderDatePicker = useCallback(() => {
    if (!datePickerState.show) return null;

    return (
      <div
        ref={datePickerRef}
        className="border-border bg-background animate-in fade-in-50 slide-in-from-top-2 absolute z-50 mt-1 overflow-hidden rounded-lg border shadow-md duration-150"
        style={{
          left: Math.max(0, datePickerState.position.left - (isMobile ? 160 : 320)),
          top: `${datePickerState.position.top}px`,
        }}
      >
        <div className="p-1">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={new Date()}
            selected={undefined}
            onSelect={handleDateSelect}
            numberOfMonths={isMobile ? 1 : 2}
            disabled={(date) => date > new Date()}
            className="rounded-md border-none"
          />
        </div>
      </div>
    );
  }, [datePickerState, isMobile, handleDateSelect]);

  useEffect(() => {
    const subscription = form.watch((data) => {
      setValue(data as SearchForm);
    });
    return () => subscription.unsubscribe();
  }, [form.watch]);

  const resetSearch = useCallback(() => {
    form.reset();
    setSearchValue({
      value: '',
      highlight: '',
      folder: '',
      isLoading: false,
      isAISearching: false
    });
  }, [form, setSearchValue]);

  return (
    <div className="relative flex-1 md:max-w-[600px]">
      <form className="relative flex items-center" onSubmit={form.handleSubmit(submitSearch)}>
        <Search className="text-muted-foreground absolute left-2.5 h-4 w-4" aria-hidden="true" />
        <div className="relative w-full">
          <Input
            placeholder={isFocused ? "" : "Search..."}
            ref={inputRef}
            className="bg-muted-foreground/20 dark:bg-muted/50 text-muted-foreground ring-muted placeholder:text-muted-foreground/70 h-8 w-full rounded-md border-none pl-9 pr-14 shadow-none transition-all duration-300"
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            value={formValues.q}
            disabled={isSearching}
          />
          {formValues.q && (
            <button
              type="button"
              onClick={resetSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              disabled={isSearching}
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {isFocused && !formValues.q && (
            <div 
              className={cn(
                "absolute left-9 right-0 bottom-[5.5px] -translate-y-1/2 text-muted-foreground/70 pointer-events-none text-sm",
                isAnimating 
                  ? "opacity-0 translate-y-2 transition-all duration-300 ease-out" 
                  : "opacity-100 translate-y-0 transition-all duration-300 ease-in"
              )}
            >
              {SEARCH_SUGGESTIONS[currentSuggestionIndex]}
            </div>
          )}
        </div>
        {renderSuggestions()}
        {renderDatePicker()}
        {/* <div className="absolute right-1 z-20 flex items-center gap-1">
          {filtering && (
            <button
              type="button"
              onClick={resetSearch}
              className="ring-offset-background focus:ring-ring rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2"
              disabled={isSearching}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">{t('common.searchBar.clearSearch')}</span>
            </button>
          )}
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'text-muted-foreground hover:bg-muted/70 hover:text-foreground h-7 w-7 rounded-md p-0',
                  popoverOpen && 'bg-muted/70 text-foreground',
                )}
                type="button"
                disabled={isSearching}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="sr-only">{t('common.searchBar.advancedSearch')}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="bg-popover w-[min(calc(100vw-2rem),400px)] rounded-md border p-4 shadow-lg sm:w-[500px] md:w-[600px]"
              side="bottom"
              sideOffset={15}
              alignOffset={-8}
              align="end"
            >
              <div className="space-y-5">
                <div>
                  <h2 className="mb-3 text-xs font-semibold">
                    {t('common.searchBar.quickFilters')}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-muted/50 hover:bg-muted h-7 rounded-md text-xs"
                      onClick={() => form.setValue('q', 'is:unread')}
                    >
                      {t('common.searchBar.unread')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-muted/50 hover:bg-muted h-7 rounded-md text-xs"
                      onClick={() => form.setValue('q', 'has:attachment')}
                    >
                      {t('common.searchBar.hasAttachment')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-muted/50 hover:bg-muted h-7 rounded-md text-xs"
                      onClick={() => form.setValue('q', 'is:starred')}
                    >
                      {t('common.searchBar.starred')}
                    </Button>
                  </div>
                </div>

                <Separator className="bg-border/50" />

                <div className="grid gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold">
                      {t('common.searchBar.searchIn')}
                    </label>
                    <Select
                      onValueChange={(value) => form.setValue('folder', value)}
                      value={form.watch('folder')}
                    >
                      <SelectTrigger className="bg-muted/50 h-8 rounded-md capitalize">
                        <SelectValue placeholder="All Mail" />
                      </SelectTrigger>
                      <SelectContent className="rounded-md">
                        {FOLDER_NAMES.map((inbox) => (
                          <SelectItem key={inbox} value={inbox} className="capitalize">
                            {inbox}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold">{t('common.searchBar.subject')}</label>
                    <Input
                      placeholder={t('common.searchBar.subject')}
                      {...form.register('subject')}
                      className="bg-muted/50 h-8 rounded-md"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold">
                        {t('common.mailDisplay.from')}
                      </label>
                      <Input
                        placeholder={t('common.searchBar.sender')}
                        {...form.register('from')}
                        className="bg-muted/50 h-8 rounded-md"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold">{t('common.mailDisplay.to')}</label>
                      <Input
                        placeholder={t('common.searchBar.recipient')}
                        {...form.register('to')}
                        className="bg-muted/50 h-8 rounded-md"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold">
                      {t('common.searchBar.dateRange')}
                    </label>
                    <DateFilter
                      date={value.dateRange}
                      setDate={(range) => form.setValue('dateRange', range)}
                    />
                  </div>
                </div>

                <Separator className="bg-border/50" />

                <div>
                  <h2 className="mb-3 text-xs font-semibold">{t('common.searchBar.category')}</h2>
                  <div className="flex flex-wrap gap-2">
                    <Toggle
                      variant="outline"
                      size="sm"
                      className="bg-muted/50 data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:ring-primary/20 h-7 rounded-md text-xs transition-colors data-[state=on]:ring-1"
                      pressed={form.watch('category') === 'primary'}
                      onPressedChange={(pressed) =>
                        form.setValue('category', pressed ? 'primary' : '')
                      }
                    >
                      {t('common.mailCategories.primary')}
                    </Toggle>
                    <Toggle
                      variant="outline"
                      size="sm"
                      className="bg-muted/50 data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:ring-primary/20 h-7 rounded-md text-xs transition-colors data-[state=on]:ring-1"
                      pressed={form.watch('category') === 'updates'}
                      onPressedChange={(pressed) =>
                        form.setValue('category', pressed ? 'updates' : '')
                      }
                    >
                      {t('common.mailCategories.updates')}
                    </Toggle>
                    <Toggle
                      variant="outline"
                      size="sm"
                      className="bg-muted/50 data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:ring-primary/20 h-7 rounded-md text-xs transition-colors data-[state=on]:ring-1"
                      pressed={form.watch('category') === 'promotions'}
                      onPressedChange={(pressed) =>
                        form.setValue('category', pressed ? 'promotions' : '')
                      }
                    >
                      {t('common.mailCategories.promotions')}
                    </Toggle>
                    <Toggle
                      variant="outline"
                      size="sm"
                      className="bg-muted/50 data-[state=on]:bg-primary/10 data-[state=on]:text-primary data-[state=on]:ring-primary/20 h-7 rounded-md text-xs transition-colors data-[state=on]:ring-1"
                      pressed={form.watch('category') === 'social'}
                      onPressedChange={(pressed) =>
                        form.setValue('category', pressed ? 'social' : '')
                      }
                    >
                      {t('common.mailCategories.social')}
                    </Toggle>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Button
                    onClick={resetSearch}
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:bg-muted hover:text-foreground h-8 rounded-md text-xs transition-colors"
                  >
                    {t('common.searchBar.reset')}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 rounded-md text-xs shadow-none transition-colors"
                    type="submit"
                    onClick={() => setPopoverOpen(false)}
                  >
                    {t('common.searchBar.applyFilters')}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div> */}
      </form>
    </div>
  );
}
