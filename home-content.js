// Add your PNGs at these paths, or change the paths below.
window.HOME_CONTENT = {
  profileImage: 'assets/profile/profile.png'
};
(() => {
  function loadImage(path,target,onReady){
    if(!target || !path)return;
    const image=new Image();image.src=new URL(path,location.href).href;
    image.decode().then(()=>{target.src=image.src;onReady?.();}).catch(()=>{});
  }
  loadImage(HOME_CONTENT.profileImage,document.getElementById('operator-profile'));
})();
