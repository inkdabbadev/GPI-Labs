document.addEventListener('DOMContentLoaded', () => {
    // Builder Animation Timeline
    const tl = gsap.timeline({ delay: 0.5 });
    
    // 1. Builder walks in
    tl.to('.builder-character', {
        x: 0,
        opacity: 1,
        duration: 1,
        ease: "power2.out"
    });
    
    // 2. Hammering sequence (loop a few times)
    const hits = 4;
    for(let i=1; i<=hits; i++) {
        // Hammer swing back
        tl.to('#hammer-tool, #builder-arm rect:first-child', {
            rotation: -50,
            transformOrigin: "45px 50px",
            duration: 0.2,
            ease: "power1.in"
        });
        
        // Hammer strike
        tl.to('#hammer-tool, #builder-arm rect:first-child', {
            rotation: 10,
            transformOrigin: "45px 50px",
            duration: 0.1,
            ease: "power2.out"
        });
        
        // Sparks show
        tl.to('#sparks', {
            opacity: 1,
            duration: 0.05
        });
        
        // Logo builds up incrementally
        tl.to('.logo-mask', {
            height: `${(i / hits) * 100}%`,
            duration: 0.2,
            ease: "bounce.out"
        }, "<"); // animate together with strike
        
        // Sparks hide
        tl.to('#sparks', {
            opacity: 0,
            duration: 0.1
        });
        
        // Hammer rests
        tl.to('#hammer-tool, #builder-arm rect:first-child', {
            rotation: -20,
            transformOrigin: "45px 50px",
            duration: 0.2
        });
    }
    
    // 3. Builder steps back and fades out
    tl.to('.builder-character', {
        x: -100,
        opacity: 0,
        duration: 1,
        ease: "power2.in"
    }, "+=0.3");
    
    // 4. Logo elevates
    tl.to('.building-logo-container', {
        y: -30,
        duration: 1,
        ease: "power2.out"
    }, "-=0.5");
    
    // 5. "Coming Soon" text comes up
    tl.to('.coming-soon-text', {
        y: 0,
        opacity: 1,
        duration: 1.2,
        ease: "power4.out"
    }, "-=0.5");

    // Scroll Animations for Works
    gsap.registerPlugin(ScrollTrigger);

    const workItems = document.querySelectorAll('.work-item');
    
    workItems.forEach(item => {
        const img = item.querySelector('.work-img-wrapper');
        const info = item.querySelector('.work-info');

        gsap.fromTo(img, 
            { y: 100, opacity: 0 },
            { 
                y: 0, 
                opacity: 1, 
                duration: 1.2, 
                ease: "power3.out",
                scrollTrigger: {
                    trigger: item,
                    start: "top 80%",
                }
            }
        );

        gsap.fromTo(info,
            { x: item.classList.contains('reverse') ? -50 : 50, opacity: 0 },
            {
                x: 0,
                opacity: 1,
                duration: 1,
                delay: 0.2,
                ease: "power2.out",
                scrollTrigger: {
                    trigger: item,
                    start: "top 75%",
                }
            }
        );
    });

});
