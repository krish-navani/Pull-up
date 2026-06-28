/**
 * Generate initials from a full name
 * @param fullName - The full name of the person
 * @returns Initials (up to 2 characters) in uppercase
 * @example
 * getInitials('John Doe') // => 'JD'
 * getInitials('Alice') // => 'A'
 * getInitials('A B C') // => 'AB'
 */
export const getInitials = (fullName: string): string => {
  if (!fullName || !fullName.trim()) {
    return '';
  }

  const words = fullName
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0);

  if (words.length === 0) {
    return '';
  }

  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }

  // Get first letter of first and last word
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
};

/**
 * Get time-appropriate greeting based on current hour
 * @param firstName - The first name of the person (optional)
 * @returns Greeting text with optional name
 * @example
 * getTimeBasedGreeting('John') // => 'Good morning, John' (6am-11:59am)
 * getTimeBasedGreeting('John') // => 'Good afternoon, John' (12pm-4:59pm)
 * getTimeBasedGreeting('John') // => 'Good evening, John' (5pm-8:59pm)
 */
export const getTimeBasedGreeting = (firstName?: string): string => {
  const hour = new Date().getHours();
  const nameString = firstName ? `, ${firstName}` : '';

  if (hour >= 5 && hour < 12) {
    return `Good morning${nameString}`;
  } else if (hour >= 12 && hour < 17) {
    return `Good afternoon${nameString}`;
  } else {
    return `Good evening${nameString}`;
  }
};

export const getGreetingContent = (firstName?: string) => {
  const name = firstName || 'there';
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return {
      emoji: '☀️',
      greeting: 'Good Morning',
      title: `☀️ Good Morning, ${name}!`,
      subtitle: 'Ready for your ride today?',
    };
  }

  if (hour >= 12 && hour < 17) {
    return {
      emoji: '🌤️',
      greeting: 'Good Afternoon',
      title: `🌤️ Good Afternoon, ${name}!`,
      subtitle: 'Hope your day is going smoothly.',
    };
  }

  return {
    emoji: '🌙',
    greeting: 'Good Evening',
    title: `🌙 Good Evening, ${name}!`,
    subtitle: 'Heading home from Atlas?',
  };
};

/**
 * Extract and capitalize full name from a university email address.
 * E.g., krish.navani.bba2027@atlasskilltech.university => Krish Navani
 */
export const getNameFromEmail = (email: string): string => {
  if (!email) return '';
  const username = email.split('@')[0];
  const parts = username.split('.');
  
  const coursePrefixes = ['bba', 'bdes', 'btech', 'mba', 'bsc', 'bcom', 'ba', 'ma', 'mtech', 'msc', 'phd', 'honors'];
  
  const nameParts = parts
    .map(part => {
      // Clean numbers from the part
      const cleaned = part.replace(/\d+/g, '').toLowerCase().trim();
      return cleaned;
    })
    .filter(part => {
      // Exclude empty parts or course prefixes
      if (!part) return false;
      if (coursePrefixes.includes(part)) return false;
      return true;
    });

  // Capitalize each name part
  return nameParts
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};
